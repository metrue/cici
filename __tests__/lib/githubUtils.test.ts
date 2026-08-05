/**
 * @jest-environment node
 */
// Runs in the Node environment on purpose: `FileReader` is a browser-only API
// and is undefined here, exactly as it is in the Vercel serverless runtime.
// This reproduces the crash from #122 ("ReferenceError: FileReader is not
// defined") — the previous FileReader-based implementation threw here, while
// the Buffer.from(arrayBuffer) implementation passes.
import { fileToBase64 } from '@/lib/githubUtils'

// Minimal stand-in for the Node `File` handed to API routes by FormData
// (undici). It exposes only `.arrayBuffer()`, matching fileToBase64's param.
class FakeFile {
  constructor(private data: Buffer) {}
  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.data.buffer.slice(
      this.data.byteOffset,
      this.data.byteOffset + this.data.byteLength,
    )
  }
}

describe('fileToBase64 (server-side, no FileReader)', () => {
  it('runs in an environment where FileReader is undefined (Vercel-like)', () => {
    // Guards the reproduction: if this ever becomes defined, the test below
    // would no longer exercise the #122 condition.
    expect(typeof FileReader).toBe('undefined')
  })

  it('encodes file bytes to base64 without FileReader', async () => {
    const file = new FakeFile(Buffer.from('hello world', 'utf8'))
    const result = await fileToBase64(file as unknown as File)
    expect(result).toBe(Buffer.from('hello world', 'utf8').toString('base64'))
    expect(result).toBe('aGVsbG8gd29ybGQ=')
  })

  it('handles arbitrary binary bytes', async () => {
    const bytes = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe])
    const file = new FakeFile(bytes)
    const result = await fileToBase64(file as unknown as File)
    expect(result).toBe(bytes.toString('base64'))
  })

  it('returns an empty string for an empty file', async () => {
    const file = new FakeFile(Buffer.alloc(0))
    expect(await fileToBase64(file as unknown as File)).toBe('')
  })
})
