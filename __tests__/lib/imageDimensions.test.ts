/**
 * @jest-environment node
 */
import { resolveImageDimensions, FALLBACK_DIMENSIONS } from '@/lib/imageDimensions.server'
import { readLocalAsset } from '@/lib/localAssets'
import { imageSize } from 'image-size'

jest.mock('@/lib/localAssets', () => ({
  // Keep the real, pure assetUrlToSegments (tests the actual /api/asset contract);
  // only the fs-backed readLocalAsset is mocked.
  ...jest.requireActual('@/lib/localAssets'),
  readLocalAsset: jest.fn(),
}))
jest.mock('image-size', () => ({ imageSize: jest.fn() }))

const mockedReadLocalAsset = readLocalAsset as jest.Mock
const mockedImageSize = imageSize as jest.Mock

function mockFetchOnce(impl: () => Promise<unknown>) {
  ;(global.fetch as unknown as jest.Mock) = jest.fn(impl as () => Promise<Response>)
}

describe('resolveImageDimensions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reads local /api/asset/ images from disk and probes their dimensions', async () => {
    mockedReadLocalAsset.mockReturnValue({ body: Buffer.from('png'), contentType: 'image/png' })
    mockedImageSize.mockReturnValue({ width: 800, height: 600 })

    const src = '/api/asset/images/2025-01-01/local-a.png'
    const result = await resolveImageDimensions([src])

    expect(result[src]).toEqual({ width: 800, height: 600 })
    expect(mockedReadLocalAsset).toHaveBeenCalledWith(['images', '2025-01-01', 'local-a.png'])
  })

  it('fetches remote images and probes their dimensions', async () => {
    mockFetchOnce(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
    mockedImageSize.mockReturnValue({ width: 1024, height: 768 })

    const src = 'https://example.com/remote-a.jpg'
    const result = await resolveImageDimensions([src])

    expect(result[src]).toEqual({ width: 1024, height: 768 })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to 1200x800 when a remote fetch fails or times out', async () => {
    mockFetchOnce(async () => {
      throw new Error('timeout')
    })

    const src = 'https://slow.example.com/remote-timeout.jpg'
    const result = await resolveImageDimensions([src])

    expect(result[src]).toEqual(FALLBACK_DIMENSIONS)
  })

  it('falls back when the local asset is missing', async () => {
    mockedReadLocalAsset.mockReturnValue(null)

    const src = '/api/asset/images/missing.png'
    const result = await resolveImageDimensions([src])

    expect(result[src]).toEqual(FALLBACK_DIMENSIONS)
  })

  it('falls back for unrecognized src shapes without touching disk or network', async () => {
    mockFetchOnce(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))

    const src = 'not-a-resolvable-src.jpg'
    const result = await resolveImageDimensions([src])

    expect(result[src]).toEqual(FALLBACK_DIMENSIONS)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockedReadLocalAsset).not.toHaveBeenCalled()
  })

  it('de-duplicates srcs and caches successful resolutions', async () => {
    mockFetchOnce(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
    mockedImageSize.mockReturnValue({ width: 640, height: 480 })

    const src = 'https://example.com/cached-a.jpg'
    // Same src twice in one call, then again in a second call.
    const first = await resolveImageDimensions([src, src])
    const second = await resolveImageDimensions([src])

    expect(first[src]).toEqual({ width: 640, height: 480 })
    expect(second[src]).toEqual({ width: 640, height: 480 })
    // Only one network call despite three references.
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
