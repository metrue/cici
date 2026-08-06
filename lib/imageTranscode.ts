/**
 * Normalize uploaded images to a web-displayable format (server-only).
 *
 * iPhones/Macs save photos as HEIC, and users often upload them with a `.jpeg`
 * name even though the bytes are still an HEIC container. Chrome/Firefox/Edge
 * can't decode HEIC, so those images render blank everywhere except Safari
 * (see #122 follow-up). We detect HEIC by its bytes and transcode it to JPEG
 * once, at the single upload choke point, so the stored file displays in every
 * browser, RSS reader, and social preview.
 *
 * Non-HEIC uploads pass through untouched.
 */

import type { AssetInput } from './runtime/types'

// ISO base-media-file-format brands that mean "this is HEIF/HEIC", not a codec
// we can serve directly. iPhone stills are `heic`; `mif1`/`msf1` are the generic
// HEIF brands; `hev*`/`hei*` cover sequences and image variants.
const HEIF_BRANDS = new Set([
  'heic', 'heix', 'heim', 'heis',
  'hevc', 'hevx', 'hevm', 'hevs',
  'mif1', 'msf1', 'miaf',
])

/**
 * True if the buffer is an HEIF/HEIC file. Reads the `ftyp` box (major brand +
 * compatible brands) — the extension is irrelevant, only the bytes matter.
 */
export function isHeic(buf: Uint8Array): boolean {
  if (buf.length < 12) return false
  // Bytes 4..8 must be the 'ftyp' box type.
  if (String.fromCharCode(buf[4], buf[5], buf[6], buf[7]) !== 'ftyp') return false
  // Box size (bytes 0..4, big-endian), clamped to what we actually have.
  const boxSize = Math.min(
    (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3],
    buf.length,
  )
  // Brands: major brand at offset 8, then compatible brands every 4 bytes from 16.
  const brandAt = (off: number): string =>
    String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3])
  if (HEIF_BRANDS.has(brandAt(8))) return true
  for (let off = 16; off + 4 <= boxSize; off += 4) {
    if (HEIF_BRANDS.has(brandAt(off))) return true
  }
  return false
}

/** Swap any extension for `.jpg` (adds it if the name had none). */
export function toJpegName(name: string): string {
  const base = name.replace(/\.[^./\\]*$/, '')
  return `${base || 'image'}.jpg`
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/** Wrap raw bytes back into the AssetInput shape the providers consume. */
function asAsset(name: string, type: string, buf: Buffer): AssetInput {
  const ab = toArrayBuffer(buf)
  return { name, type, arrayBuffer: async () => ab }
}

/**
 * Return an upload-ready file: HEIC is transcoded to JPEG (renamed `.jpg`);
 * everything else is returned unchanged (bytes read once, no re-read).
 * Throws if an HEIC file can't be decoded — we never want to store bytes no
 * browser can render.
 */
export async function normalizeUploadFile(file: AssetInput): Promise<AssetInput> {
  const input = Buffer.from(await file.arrayBuffer())

  if (!isHeic(input)) {
    return asAsset(file.name, file.type ?? 'application/octet-stream', input)
  }

  try {
    // Dynamic import: libheif WASM is only loaded when an HEIC actually arrives,
    // keeping it off the hot path for normal JPEG/PNG uploads.
    const heicConvert = (await import('heic-convert')).default
    const out = await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 })
    const jpeg = Buffer.from(out)
    console.log(`Transcoded HEIC → JPEG (${input.length} → ${jpeg.length} bytes)`)
    return asAsset(toJpegName(file.name), 'image/jpeg', jpeg)
  } catch (err) {
    throw new Error(
      `Failed to transcode HEIC image "${file.name}" to JPEG: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}
