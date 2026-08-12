/**
 * Server-side helpers shared by `app/api/blog/[id]/highlights/**` routes.
 *
 * Centralises:
 *   - Anonymous fingerprinting (reused from `lib/likeUtils.ts`)
 *   - Owner authentication via NextAuth
 *   - Standard `ApiResponse<T>` envelope
 *   - Validation primitives
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  createUserFingerprint,
  detectPlatform,
  getClientIP,
  getLocationFromHeaders,
  hashIP,
} from '@/lib/likeUtils'
import { getSession } from '@/lib/auth'
import { isOwner, fetchGithubLogin } from '@/lib/runtime/authz'
import { Platform } from './schema'
import { HighlightsWriteUnavailableError } from './highlightsRepo'

export { isOwner }

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export function apiOk<T>(data: T, init?: ResponseInit): NextResponse<ApiResponse<T>> {
  return NextResponse.json<ApiResponse<T>>({ success: true, data }, init)
}

export function apiError(message: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json<ApiResponse<never>>({ success: false, error: message }, { status })
}

/**
 * Convert an unknown error from a route catch block into an `ApiResponse`.
 * The actual error message is surfaced to the client — this is a personal
 * blog where debuggability beats security-via-obscurity, and the only
 * sensitive thing we care about (the GitHub token) never appears in error
 * messages anyway. Always logs the full stack server-side.
 */
export function apiErrorFrom(
  err: unknown,
  fallback = 'Internal server error',
  status = 500,
): NextResponse<ApiResponse<never>> {
  console.error('[highlights]', err)
  // A missing/underprivileged write token isn't a 500 — it's a known
  // "commenting unavailable" state. Return 503 with the actionable message
  // (the real reason + GitHub cause are logged above for the owner).
  if (err instanceof HighlightsWriteUnavailableError) {
    console.error('[highlights] write unavailable:', err.reason)
    return apiError(err.message, 503)
  }
  const message =
    err instanceof Error && err.message ? err.message : fallback
  return apiError(message, status)
}

export interface RequestIdentity {
  fingerprint: string
  country: string
  platform: Platform
}

export function extractIdentity(request: NextRequest): RequestIdentity {
  const ip = getClientIP(request)
  const location = getLocationFromHeaders(request)
  const hashedIP = hashIP(ip)
  const fingerprint = createUserFingerprint(hashedIP, location)
  return {
    fingerprint,
    country: location.country,
    platform: detectPlatform(location.userAgent) as Platform,
  }
}

export async function getOwnerToken(): Promise<string | undefined> {
  const session = await getSession()
  return session?.accessToken
}

/**
 * GitHub username (or display name) of the currently logged-in user, if
 * any. Used to attribute comments by name when the form's `authorName`
 * field is empty but the user is signed in.
 */
export async function getSessionDisplayName(): Promise<string | null> {
  const session = await getSession()
  if (session?.user?.username) return session.user.username
  // Recovery: legacy sessions — fetch GitHub login from access token.
  if (session?.accessToken) {
    const login = await fetchGithubLogin(session.accessToken)
    if (login) return login
  }
  return session?.user?.name ?? null
}

/**
 * Parse + validate JSON body. Returns the parsed value, or throws an
 * `ApiBodyError` with a useful message that callers can convert to 400.
 */
export class ApiBodyError extends Error {}

export async function parseBody<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new ApiBodyError('Invalid JSON body')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new ApiBodyError(
      result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
    )
  }
  return result.data
}
