/**
 * Server-side image dimension extraction for in-place photo galleries
 * (issue #120). `react-photo-album` needs an explicit width/height per image;
 * resolving them on the server means the gallery ships correctly-sized in the
 * SSR HTML with no client-side probing and no layout shift.
 *
 * Two resolution paths, chosen by the image `src` shape:
 *   - `/api/asset/…` (local `--dir` mode) → read the file straight from disk via
 *     the existing path-guarded `readLocalAsset` (instant, no HTTP).
 *   - `http(s)://…` (GitHub raw URLs in `--repo` mode, or any external URL) →
 *     `fetch` with a short timeout and read the header bytes.
 * Anything unresolved falls back to a sane 1200×800 (3:2) placeholder.
 *
 * Server-only: touches the filesystem and the network.
 */

import { imageSize } from 'image-size'
import { readLocalAsset, assetUrlToSegments } from './localAssets'

export interface ImageDimensions {
  width: number
  height: number
}

/** Placeholder used when dimensions can't be determined. */
export const FALLBACK_DIMENSIONS: ImageDimensions = { width: 1200, height: 800 }

const REMOTE_TIMEOUT_MS = 2000
// Image headers (dimensions) live in the first bytes; fetch only those so a
// gallery of large remote images doesn't download full payloads at SSR time.
// Servers that ignore Range return the full 200 body, so this degrades safely.
const HEADER_BYTES = 65535

// Successfully-resolved dimensions, keyed by src. Failures are NOT cached, so a
// flaky remote can recover on a later revalidation instead of being pinned to
// the fallback forever.
const cache = new Map<string, ImageDimensions>()

function dimensionsFromBuffer(buffer: Uint8Array): ImageDimensions | null {
  try {
    const { width, height } = imageSize(buffer)
    if (width && height) return { width, height }
  } catch {
    // Unrecognized/corrupt image — fall through to the fallback.
  }
  return null
}

async function resolveOne(src: string): Promise<ImageDimensions> {
  const cached = cache.get(src)
  if (cached) return cached

  let dims: ImageDimensions | null = null

  const segments = assetUrlToSegments(src)
  if (segments) {
    const asset = readLocalAsset(segments)
    if (asset) dims = dimensionsFromBuffer(asset.body)
  } else if (/^https?:\/\//i.test(src) || src.startsWith('//')) {
    const url = src.startsWith('//') ? `https:${src}` : src
    try {
      const res = await fetch(url, {
        headers: { Range: `bytes=0-${HEADER_BYTES}` },
        signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
      })
      if (res.ok) {
        dims = dimensionsFromBuffer(new Uint8Array(await res.arrayBuffer()))
      }
    } catch {
      // Timeout / network error — fall back below.
    }
  }

  if (dims) {
    cache.set(src, dims)
    return dims
  }
  return FALLBACK_DIMENSIONS
}

/**
 * Resolve dimensions for a set of image srcs. De-duplicates and resolves
 * concurrently; every input src is present in the returned map (fallback when
 * unresolved).
 */
export async function resolveImageDimensions(
  srcs: readonly string[]
): Promise<Record<string, ImageDimensions>> {
  const unique = Array.from(new Set(srcs))
  const entries = await Promise.all(
    unique.map(async (src) => [src, await resolveOne(src)] as const)
  )
  return Object.fromEntries(entries)
}
