/**
 * Write authorization — the single place that decides "may the current request
 * edit content?". Consumed by the editor page (`app/editor/page.tsx`) and every
 * GraphQL mutation (`app/api/graphql/route.ts`).
 *
 * Three trust models, matching the runtime backends:
 *   - local (`npx cici --dir` / `next dev`)      → always writable (own machine)
 *   - localhost CLI (`--repo … --token …`, no OAuth) → writable via CICI_TOKEN
 *   - hosted OAuth deploy                         → writable only by the repo OWNER,
 *                                                    via their GitHub OAuth session
 *
 * Server-only: reads process.env and the NextAuth session. Do not import from
 * client components.
 */

import { getSession } from '@/lib/auth'
import { resolveRuntimeConfig } from './config'

/** A hosted deploy configures a GitHub OAuth app; the localhost CLI does not. */
function isHostedOAuthMode(): boolean {
  return !!process.env.GITHUB_ID
}

/**
 * True when the logged-in user is the blog's owner. The owner is derived from
 * the runtime config (`CICI_REPO`'s owner, or `GITHUB_USERNAME` in the default
 * production layout) — so a `CICI_REPO=owner/name` deploy needs no separate
 * `GITHUB_USERNAME`.
 *
 * Local mode has no accounts: the single local user is the trusted owner.
 */
export async function isOwner(): Promise<boolean> {
  const config = resolveRuntimeConfig()
  if (config.kind === 'local') return true

  const owner = config.owner
  if (!owner) return false

  const session = await getSession()

  // Fast path: the JWT callback (lib/auth.ts) captures `profile.login` onto the
  // token for logins after that fix.
  if (session?.user?.username) {
    return session.user.username === owner
  }

  // Recovery path: legacy sessions predating the JWT fix carry no username but
  // do have an accessToken — resolve the GitHub login once and compare.
  if (session?.accessToken) {
    const login = await fetchGithubLogin(session.accessToken)
    if (login) return login === owner
  }

  return false
}

/**
 * The authorization gate for all writes. See the module header for the trust
 * models.
 */
export async function isAuthorizedToWrite(): Promise<boolean> {
  const config = resolveRuntimeConfig()
  if (config.kind === 'local') return true

  // Localhost CLI: no OAuth app, single trusted user on loopback — a preset
  // CICI_TOKEN (from `--token`) is the write credential.
  if (!isHostedOAuthMode()) {
    return !!process.env.CICI_TOKEN
  }

  // Hosted OAuth deploy: only the owner may write, via their own session.
  return isOwner()
}

/**
 * Resolve the GitHub login (username) for an access token, with a small
 * in-memory cache. Recovery path for sessions whose JWT predates the
 * `profile.login` capture in `lib/auth.ts`.
 */
const githubLoginCache = new Map<string, { login: string; expiresAt: number }>()
const GITHUB_LOGIN_TTL_MS = 10 * 60 * 1000

export async function fetchGithubLogin(accessToken: string): Promise<string | null> {
  const cached = githubLoginCache.get(accessToken)
  if (cached && cached.expiresAt > Date.now()) return cached.login

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { login?: string }
    const login = typeof data.login === 'string' ? data.login : null
    if (login) {
      githubLoginCache.set(accessToken, {
        login,
        expiresAt: Date.now() + GITHUB_LOGIN_TTL_MS,
      })
    }
    return login
  } catch (err) {
    console.error('[authz] fetchGithubLogin failed', err)
    return null
  }
}
