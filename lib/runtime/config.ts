/**
 * Resolve the runtime configuration from environment (set by the CLI or the
 * deploy platform). This is the single source of truth for "which backend".
 *
 * Precedence:
 *   1. CICI_DIR              → local filesystem (`npx cici --dir <path>`)
 *   2. CICI_REPO=owner/name  → remote GitHub repo (`npx cici --repo owner/name`)
 *   3. GITHUB_USERNAME       → production: the owner's repo
 *
 * The write token is mode-aware (see `writeToken` below): on a hosted deploy
 * (GitHub OAuth configured) writes use the visitor's OAuth session token ONLY —
 * a shared `CICI_TOKEN` is deliberately ignored so it can never grant write to
 * the public. On the localhost CLI (no OAuth) `CICI_TOKEN` (from `--token`)
 * enables writes for the single trusted user on loopback.
 *
 * Server-only (reads process.env + path). Do not import from client components.
 */

import path from 'path'
import type { RuntimeConfig } from './types'

const DEFAULT_REPO = 'cici'

/**
 * A hosted deploy configures a GitHub OAuth app (`GITHUB_ID`); the localhost
 * CLI does not. This is how we distinguish "public site, many visitors" from
 * "single trusted user on 127.0.0.1".
 */
function isHostedOAuthMode(): boolean {
  return !!process.env.GITHUB_ID
}

let warnedStaleToken = false

/**
 * The GitHub write token for the remote-repo backends. In hosted OAuth mode it
 * is the visitor's session token only (never `CICI_TOKEN`); on the localhost
 * CLI it falls back to `CICI_TOKEN`.
 */
function writeToken(sessionToken?: string): string | undefined {
  if (isHostedOAuthMode()) {
    if (process.env.CICI_TOKEN && !warnedStaleToken) {
      warnedStaleToken = true
      console.warn(
        '[cici] CICI_TOKEN is set but ignored in hosted (OAuth) mode — writes are ' +
          'authorized per-visitor via GitHub OAuth and restricted to the repo owner. ' +
          'Ensure your content repo is public so reads work without a token, and remove CICI_TOKEN.',
      )
    }
    return sessionToken || undefined
  }
  return process.env.CICI_TOKEN || sessionToken || undefined
}

export function resolveRuntimeConfig(sessionToken?: string): RuntimeConfig {
  const dir = process.env.CICI_DIR
  if (dir) {
    return { kind: 'local', dir: path.resolve(dir) }
  }

  const repoSpec = process.env.CICI_REPO
  if (repoSpec) {
    const [owner, repo] = repoSpec.split('/')
    if (!owner) {
      throw new Error(`Invalid CICI_REPO "${repoSpec}" — expected "owner/name".`)
    }
    return {
      kind: 'github',
      owner,
      repo: repo || DEFAULT_REPO,
      token: writeToken(sessionToken),
    }
  }

  // Local development: serve the shipped demo fixture under <cwd>/sample-content.
  // Real blog content lives in a separate repo — served via CICI_DIR/CICI_REPO.
  if (process.env.NODE_ENV === 'development') {
    return { kind: 'local', dir: path.join(process.cwd(), 'sample-content') }
  }

  // Production / default: the deployed owner's repo, session token for writes.
  const owner = process.env.GITHUB_USERNAME || 'metrue'
  return { kind: 'github', owner, repo: DEFAULT_REPO, token: sessionToken || undefined }
}
