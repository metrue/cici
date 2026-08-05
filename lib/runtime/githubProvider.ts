/**
 * GitHubProvider — the GitHub runtime backend.
 *
 * Serves two cases behind one class:
 *   - `npx cici --repo owner/name`  (read-only, or read-write with a token)
 *   - production on Vercel          (owner = GITHUB_USERNAME, session token)
 *
 * Reads use public raw.githubusercontent URLs (no rate limit, works without a
 * token). Writes use the Octokit-backed helpers, targeted at the configured
 * owner/repo — so a token can edit an arbitrary content repo, not just the
 * token owner's. Without a token the provider is read-only (writes throw).
 *
 * Server-only.
 */

import type { Octokit } from '@octokit/rest'
import type { BlogPost, Memo } from '@/lib/types'
import type { LikesDatabase } from '@/lib/likeUtils'
import type { SiteConfig } from '@/lib/siteConfig'
import { contentPaths } from '@/lib/content/paths'
import { slugFromTitle } from '@/lib/blogFrontmatter'
import { getOctokit, updateFileContents } from '@/lib/githubUtils'
import {
  createBlogPost as ghCreateBlogPost,
  updateBlogPost as ghUpdateBlogPost,
  deleteBlogPost as ghDeleteBlogPost,
  uploadImage as ghUploadImage,
  type RepoTarget,
} from '@/lib/githubApi'
import { PublicGitHubClient } from '@/lib/publicClient'
import { createGitHubAPIClient } from '@/lib/client'
import { GitHubHighlightsRepo, type HighlightsRepo } from '@/lib/highlights/highlightsRepo'
import { ReadOnlyError, type AssetInput, type BlogSaveInput, type ContentProvider } from './types'

type ApiReader = ReturnType<typeof createGitHubAPIClient>

export class GitHubProvider implements ContentProvider {
  private readonly owner: string
  private readonly repo: string
  private readonly token?: string
  private readonly reader: PublicGitHubClient
  /** API reader (fresh, includes drafts) — only when authenticated. */
  private readonly apiReader?: ApiReader
  private readonly target: RepoTarget

  constructor(cfg: { owner: string; repo: string; token?: string }) {
    this.owner = cfg.owner
    this.repo = cfg.repo
    this.token = cfg.token
    this.reader = new PublicGitHubClient(cfg.owner, cfg.repo)
    this.apiReader = cfg.token ? createGitHubAPIClient(cfg.token, cfg.repo) : undefined
    this.target = { owner: cfg.owner, repo: cfg.repo }
  }

  /**
   * Read fresh via the GitHub API when authenticated (so the owner sees edits
   * immediately), falling back to public raw URLs on any API error. Without a
   * token, reads are raw-URL only.
   */
  private async fresh<T>(viaApi: (c: ApiReader) => Promise<T>, viaRaw: () => Promise<T>): Promise<T> {
    if (this.apiReader) {
      try {
        return await viaApi(this.apiReader)
      } catch (error) {
        console.warn('GitHub API read failed, falling back to raw URL:', error)
      }
    }
    return viaRaw()
  }

  get label(): string {
    return `github: ${this.owner}/${this.repo}${this.token ? '' : ' (read-only)'}`
  }

  canWrite(): boolean {
    return !!this.token
  }

  private requireToken(): string {
    if (!this.token) throw new ReadOnlyError()
    return this.token
  }

  private writeOctokit(): Octokit {
    return getOctokit(this.requireToken())
  }

  // --- reads (API-fresh when authenticated, raw URL otherwise) ---
  getBlogPosts(opts?: { includeDrafts?: boolean }): Promise<BlogPost[]> {
    const includeDrafts = opts?.includeDrafts ?? false
    return this.fresh(
      (c) => c.getBlogPosts(this.owner, includeDrafts),
      () => this.reader.getBlogPosts(includeDrafts)
    )
  }

  async getBlogPost(id: string): Promise<BlogPost | undefined> {
    const post = await this.fresh<BlogPost | null | undefined>(
      (c) => c.getBlogPost(`${id}.md`, this.owner),
      () => this.reader.getBlogPost(`${id}.md`)
    )
    return post ?? undefined
  }

  getMemos(): Promise<Memo[]> {
    return this.fresh(
      (c) => c.getMemos(this.owner),
      () => this.reader.getMemos()
    )
  }

  getLinks(): Promise<Record<string, string>> {
    return this.fresh(
      (c) => c.getLinks(this.owner),
      () => this.reader.getLinks()
    )
  }

  getLikes(): Promise<LikesDatabase> {
    return this.fresh(
      (c) => c.getLikes(this.owner),
      () => this.reader.getLikes()
    )
  }

  async getSiteConfig(): Promise<SiteConfig | null> {
    // Authenticated read first: the public raw URL 404s on a PRIVATE repo, so
    // when we hold a token read via the GitHub contents API. Fall back to the
    // public raw URL on any error / when there's no token.
    if (this.token) {
      try {
        const octokit = getOctokit(this.token)
        const res = await octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: contentPaths.siteConfig(),
        })
        if (!Array.isArray(res.data) && 'content' in res.data) {
          const content = Buffer.from(res.data.content, 'base64').toString('utf-8')
          return JSON.parse(content) as SiteConfig
        }
      } catch (error) {
        console.warn('GitHub API site-config read failed, falling back to raw URL:', error)
      }
    }
    try {
      const url = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/main/${contentPaths.siteConfig()}`
      const res = await fetch(url)
      if (!res.ok) return null
      return (await res.json()) as SiteConfig
    } catch {
      return null
    }
  }

  // --- blog + asset writes (delegate to the targeted GitHub helpers) ---
  async createBlogPost(input: BlogSaveInput): Promise<string> {
    const token = this.requireToken()
    await ghCreateBlogPost(input.title, input.content, token, input.discussions, input.location, input.status, this.target)
    return slugFromTitle(input.title)
  }

  async updateBlogPost(id: string, input: BlogSaveInput): Promise<string> {
    const token = this.requireToken()
    await ghUpdateBlogPost(id, input.title, input.content, token, input.discussions, input.location, input.status, this.target)
    return id
  }

  async deleteBlogPost(id: string): Promise<void> {
    await ghDeleteBlogPost(id, this.requireToken(), this.target)
  }

  async uploadAsset(file: AssetInput): Promise<string> {
    return ghUploadImage(file, this.requireToken(), this.target)
  }

  // --- memo + likes writes (JSON files, edited in place) ---
  async createMemo(memo: Memo): Promise<Memo> {
    const path = contentPaths.memos()
    const { data, sha } = await this.getJsonFile<Memo[]>(path)
    const memos = Array.isArray(data) ? data : []
    await this.putFile(path, JSON.stringify([memo, ...memos], null, 2), `Add memo ${memo.id}`, sha)
    return memo
  }

  async updateMemo(id: string, content: string): Promise<Memo> {
    const path = contentPaths.memos()
    const { data, sha } = await this.getJsonFile<Memo[]>(path)
    const memos = Array.isArray(data) ? data : []
    const idx = memos.findIndex((m) => m.id === id)
    if (idx === -1) throw new Error('Memo not found')
    const updated: Memo = { ...memos[idx], content }
    const next = memos.map((m, i) => (i === idx ? updated : m))
    await this.putFile(path, JSON.stringify(next, null, 2), `Update memo ${id}`, sha)
    return updated
  }

  async deleteMemo(id: string): Promise<void> {
    const path = contentPaths.memos()
    const { data, sha } = await this.getJsonFile<Memo[]>(path)
    const memos = Array.isArray(data) ? data : []
    await this.putFile(path, JSON.stringify(memos.filter((m) => m.id !== id), null, 2), `Delete memo ${id}`, sha)
  }

  async updateLikes(likes: LikesDatabase): Promise<void> {
    const path = contentPaths.likes()
    const { sha } = await this.getJsonFile<LikesDatabase>(path)
    await this.putFile(path, JSON.stringify(likes, null, 2), 'Update likes', sha)
  }

  highlights(): HighlightsRepo {
    // Unauthenticated Octokit still reads public content; writes need the token.
    return new GitHubHighlightsRepo(getOctokit(this.token as string), this.owner, this.repo)
  }

  // --- private helpers ---
  private async getJsonFile<T>(path: string): Promise<{ data: T | null; sha?: string }> {
    const octokit = this.writeOctokit()
    try {
      const res = await octokit.repos.getContent({ owner: this.owner, repo: this.repo, path })
      if (Array.isArray(res.data) || !('content' in res.data)) return { data: null }
      const content = Buffer.from(res.data.content, 'base64').toString('utf-8')
      return { data: JSON.parse(content) as T, sha: res.data.sha }
    } catch (error) {
      if ((error as { status?: number })?.status === 404) return { data: null }
      throw error
    }
  }

  private putFile(path: string, content: string, message: string, sha?: string): Promise<void> {
    return updateFileContents(this.writeOctokit(), this.owner, this.repo, path, message, content, sha)
  }
}
