/**
 * Storage layer for inline highlight comments.
 *
 * Storage shape: one JSON file per post at `data/highlights/<post-slug>.json`,
 * structured as a `PostHighlights` blob.
 *
 * Two backends:
 *   - `LocalFsHighlightsRepo` for `NODE_ENV=development` (writes to disk
 *     under the repo root, mirroring how `localClient.server.ts` works for
 *     posts).
 *   - `GitHubHighlightsRepo` for production (writes via Octokit with
 *     SHA-based optimistic concurrency and bounded retries).
 *
 * Reads work with no token on a **public** content repo (unauthenticated
 * Octokit). Writes require a token: the logged-in owner's session token
 * (passed via `ownerToken`), `CICI_TOKEN`, or `HIGHLIGHTS_GH_TOKEN`. With no
 * token the repo is read-only and `save()` throws — so anonymous visitors can
 * read inline comments but only the owner can add or moderate them.
 *
 * Reads are cached in-memory for 30 s to keep GitHub reads off the hot path.
 */

import { promises as fs } from 'fs'
import path from 'path'
import { Octokit } from '@octokit/rest'

import {
  PostHighlights,
  PostHighlightsSchema,
  emptyPostHighlights,
} from './schema'
import { contentPaths, contentRel } from '../content/paths'
import { resolveRuntimeConfig } from '../runtime/config'

const REPO = 'cici'
const CACHE_TTL_MS = 30_000
const SAVE_RETRY_LIMIT = 3
const MAX_POST_ID_LENGTH = 200

export interface LoadedHighlights {
  data: PostHighlights
  /** GitHub blob SHA, or `null` for files that don't exist yet / dev mode. */
  sha: string | null
}

export interface SaveResult {
  sha: string
}

export interface HighlightsRepo {
  load(postId: string): Promise<LoadedHighlights>
  save(
    postId: string,
    data: PostHighlights,
    expectedSha: string | null,
    commitMessage: string,
  ): Promise<SaveResult>
}

interface CacheEntry {
  data: PostHighlights
  sha: string | null
  expiresAt: number
}

/** Module-scope cache shared across repo instances. */
const cache = new Map<string, CacheEntry>()

export function clearHighlightsCache(): void {
  cache.clear()
}

function pathFor(postId: string): string {
  return contentPaths.highlightsFile(postId)
}

function assertSafePostId(postId: string): void {
  // Reject empty / oversized — and any character or pattern that could
  // escape `data/highlights/<postId>.json` to write somewhere else on
  // disk or in the GitHub repo. We DON'T enforce an ASCII allowlist —
  // the blog has CJK-titled posts (e.g. `我做了一款旅行记录应用：mile`)
  // and we want them to work.
  if (!postId || postId.length === 0 || postId.length > MAX_POST_ID_LENGTH) {
    throw new Error(`Invalid postId: ${postId}`)
  }
  if (
    postId.includes('/') ||
    postId.includes('\\') ||
    postId.includes('\x00') ||
    postId.includes('..') ||
    postId.startsWith('.')
  ) {
    throw new Error(`Invalid postId: ${postId}`)
  }
}

function getStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const s = (err as { status?: unknown }).status
    return typeof s === 'number' ? s : undefined
  }
  return undefined
}

/** Minimal Octokit shape we depend on — keeps tests injectable. */
export interface OctokitLike {
  repos: {
    getContent: (params: { owner: string; repo: string; path: string }) => Promise<{
      data: unknown
    }>
    createOrUpdateFileContents: (params: {
      owner: string
      repo: string
      path: string
      message: string
      content: string
      sha?: string
    }) => Promise<{
      data: { content?: { sha?: string } | null }
    }>
  }
}

export class LocalFsHighlightsRepo implements HighlightsRepo {
  constructor(private rootDir: string) {}

  private absPath(postId: string): string {
    // rootDir is the content root (localDataDir), so use the root-relative path.
    return path.join(this.rootDir, contentRel.highlightsFile(postId))
  }

  async load(postId: string): Promise<LoadedHighlights> {
    assertSafePostId(postId)
    try {
      const text = await fs.readFile(this.absPath(postId), 'utf-8')
      const parsed = PostHighlightsSchema.parse(JSON.parse(text))
      return { data: parsed, sha: null }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'ENOENT') {
        return { data: emptyPostHighlights(postId), sha: null }
      }
      throw err
    }
  }

  async save(
    postId: string,
    data: PostHighlights,
    expectedSha: string | null,
    commitMessage: string,
  ): Promise<SaveResult> {
    void expectedSha // local FS has no concurrency
    void commitMessage // local FS has no commit metadata
    assertSafePostId(postId)
    const validated = PostHighlightsSchema.parse(data)
    const filePath = this.absPath(postId)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(validated, null, 2), 'utf-8')
    return { sha: '' }
  }
}

/**
 * A write failed because the repo has no usable write credential — either no
 * token at all (read-only), or a token that GitHub rejected (missing
 * `contents:write` on the content repo). Carries a user-facing `message` and a
 * `reason` for server logs. Routes map this to a 503 so visitors see an
 * actionable message instead of a raw GitHub error.
 */
export class HighlightsWriteUnavailableError extends Error {
  readonly reason: string
  constructor(reason: string, options?: { cause?: unknown }) {
    super('Commenting is temporarily unavailable. Please try again later.', options)
    this.name = 'HighlightsWriteUnavailableError'
    this.reason = reason
  }
}

export class GitHubHighlightsRepo implements HighlightsRepo {
  constructor(
    private octokit: OctokitLike,
    private owner: string,
    private repo: string = REPO,
    /** When true, the backing Octokit is unauthenticated: reads work on a
     * public repo but `save()` throws. */
    private readOnly: boolean = false,
  ) {}

  async load(postId: string): Promise<LoadedHighlights> {
    assertSafePostId(postId)

    const cached = cache.get(postId)
    if (cached && cached.expiresAt > Date.now()) {
      return { data: cached.data, sha: cached.sha }
    }

    const file = await this.readFile(postId)
    if (!file) {
      const empty = emptyPostHighlights(postId)
      cache.set(postId, { data: empty, sha: null, expiresAt: Date.now() + CACHE_TTL_MS })
      return { data: empty, sha: null }
    }

    const parsed = PostHighlightsSchema.parse(JSON.parse(file.content))
    cache.set(postId, { data: parsed, sha: file.sha, expiresAt: Date.now() + CACHE_TTL_MS })
    return { data: parsed, sha: file.sha }
  }

  async save(
    postId: string,
    data: PostHighlights,
    expectedSha: string | null,
    commitMessage: string,
  ): Promise<SaveResult> {
    assertSafePostId(postId)
    if (this.readOnly) {
      throw new HighlightsWriteUnavailableError(
        'no write token available (set HIGHLIGHTS_GH_TOKEN with contents:write on the content repo, or sign in as the owner)',
      )
    }
    const validated = PostHighlightsSchema.parse(data)
    const content = Buffer.from(JSON.stringify(validated, null, 2)).toString('base64')

    let attempt = 0
    let currentSha: string | null = expectedSha

    while (attempt < SAVE_RETRY_LIMIT) {
      try {
        const res = await this.octokit.repos.createOrUpdateFileContents({
          owner: this.owner,
          repo: this.repo,
          path: pathFor(postId),
          message: commitMessage,
          content,
          ...(currentSha ? { sha: currentSha } : {}),
        })
        const newSha = res.data.content?.sha ?? ''
        cache.set(postId, { data: validated, sha: newSha, expiresAt: Date.now() + CACHE_TTL_MS })
        return { sha: newSha }
      } catch (err: unknown) {
        const status = getStatus(err)
        if (status === 409 || status === 422) {
          // Concurrent write — drop cache, re-read SHA, retry.
          cache.delete(postId)
          attempt++
          const fresh = await this.readFile(postId)
          currentSha = fresh?.sha ?? null
          continue
        }
        // 403/404 on a write means the token can't write to the content repo
        // (missing contents:write, or a fine-grained PAT without repo access).
        // Surface it as an actionable "unavailable" rather than a raw GitHub error.
        if (status === 403 || status === 404) {
          throw new HighlightsWriteUnavailableError(
            `GitHub rejected the write (status ${status}) on ${this.owner}/${this.repo} — the write token lacks contents:write, or the owner/repo is misconfigured`,
            { cause: err },
          )
        }
        throw err
      }
    }

    throw new Error(`Save failed after ${SAVE_RETRY_LIMIT} retries due to write contention`)
  }

  private async readFile(postId: string): Promise<{ content: string; sha: string } | null> {
    try {
      const res = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: pathFor(postId),
      })
      const data = res.data as
        | { type?: string; content?: string; sha?: string; encoding?: string }
        | unknown[]
      if (Array.isArray(data) || (data as { type?: string }).type !== 'file') {
        return null
      }
      const file = data as { content: string; sha: string }
      return {
        content: Buffer.from(file.content, 'base64').toString('utf-8'),
        sha: file.sha,
      }
    } catch (err: unknown) {
      if (getStatus(err) === 404) return null
      throw err
    }
  }
}

export interface GetRepoOptions {
  /** Override token (e.g. logged-in owner moderation flow). Falls back to env. */
  ownerToken?: string
}

/**
 * Pick a `HighlightsRepo` for the current environment.
 *
 * On a GitHub backend with no token, returns a read-only repo backed by an
 * unauthenticated Octokit — reads render on a public content repo, and
 * `save()` throws so only the owner (session token) can write.
 */
export function getHighlightsRepo(opts: GetRepoOptions = {}): HighlightsRepo {
  const cfg = resolveRuntimeConfig(opts.ownerToken)

  if (cfg.kind === 'local') {
    if (typeof window === 'undefined') {
      return new LocalFsHighlightsRepo(cfg.dir)
    }
    // Local backend reached in a browser context — the local FS repo is
    // server-only, so there's nothing usable here.
    throw new Error('Local highlights repo is server-only.')
  }

  const token = opts.ownerToken ?? cfg.token ?? process.env.HIGHLIGHTS_GH_TOKEN
  const octokit = token ? new Octokit({ auth: token }) : new Octokit()
  return new GitHubHighlightsRepo(octokit, cfg.owner, cfg.repo, !token)
}
