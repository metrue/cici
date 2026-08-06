/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import { isHeic, toJpegName, normalizeUploadFile } from '@/lib/imageTranscode'
import type { AssetInput } from '@/lib/runtime/types'

const HEIC_FIXTURE = path.join(__dirname, '../fixtures/tiny.heic')

function fileFrom(name: string, type: string, buf: Buffer): AssetInput {
  return {
    name,
    type,
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  }
}

describe('isHeic', () => {
  it('detects a real HEIC file by its bytes', () => {
    expect(isHeic(fs.readFileSync(HEIC_FIXTURE))).toBe(true)
  })

  it('rejects JPEG and PNG', () => {
    expect(isHeic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]))).toBe(false) // JPEG
    expect(isHeic(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]))).toBe(false) // PNG
  })

  it('rejects other ISO-BMFF (e.g. mp4) — only HEIF brands count', () => {
    // ftyp box, major brand "mp42", compatible "mp42"/"isom" — not HEIF.
    const mp4 = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex')
    expect(isHeic(mp4)).toBe(false)
  })

  it('rejects too-short buffers', () => {
    expect(isHeic(Buffer.from([0x00, 0x01]))).toBe(false)
  })
})

describe('toJpegName', () => {
  it('swaps the extension for .jpg', () => {
    expect(toJpegName('IMG_1333.jpeg')).toBe('IMG_1333.jpg')
    expect(toJpegName('photo.HEIC')).toBe('photo.jpg')
    expect(toJpegName('a.b.heic')).toBe('a.b.jpg')
  })
  it('adds .jpg when there is no extension', () => {
    expect(toJpegName('noext')).toBe('noext.jpg')
  })
})

describe('normalizeUploadFile', () => {
  it('passes non-HEIC files through unchanged', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
    const out = await normalizeUploadFile(fileFrom('pic.png', 'image/png', png))
    expect(out.name).toBe('pic.png')
    expect(out.type).toBe('image/png')
    expect(Buffer.from(await out.arrayBuffer())).toEqual(png)
  })

  it('transcodes a real HEIC file to a browser-renderable JPEG', async () => {
    const heic = fs.readFileSync(HEIC_FIXTURE)
    const out = await normalizeUploadFile(fileFrom('IMG_1333.jpeg', 'image/jpeg', heic))
    expect(out.name).toBe('IMG_1333.jpg')
    expect(out.type).toBe('image/jpeg')
    const bytes = Buffer.from(await out.arrayBuffer())
    // Real JPEG starts with the SOI marker FF D8 FF — what the old HEIC lacked.
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff')
    expect(bytes.length).toBeGreaterThan(0)
  }, 15000)
})
