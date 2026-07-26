/**
 * Simple working tests for PublicGitHubClient
 * These tests validate the core rate limit avoidance functionality
 */

import { PublicGitHubClient } from '@/lib/publicClient'

// Cache module has been removed - no mocking needed

describe('PublicGitHubClient - Rate Limit Tests', () => {
  let client: PublicGitHubClient
  const testOwner = 'testuser'

  beforeEach(() => {
    client = new PublicGitHubClient(testOwner)
    jest.clearAllMocks()
  })

  describe('Rate limit avoidance', () => {
    it('should use raw GitHub URLs instead of API', async () => {
      const mockMemos = [
        { id: '1', content: 'Test memo', timestamp: '2024-01-01T00:00:00.000Z' },
      ]

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMemos),
      })

      const result = await client.getMemos()

      // ✅ Uses raw URL, not API
      expect(global.fetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/testuser/cici/main/data/memos.json'
      )
      expect(result).toEqual(mockMemos)
    })

    it('should handle blog posts without API calls', async () => {
      const mockBlogContent = `---
title: Test Post
date: 2024-01-01T00:00:00.000Z
---

Test content`

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockBlogContent),
      })

      const result = await client.getBlogPost('test.md')

      // ✅ Uses raw URL for blog post bodies (cache options are attached but the
      // endpoint is still raw.githubusercontent.com — no API budget spent).
      expect(global.fetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/testuser/cici/main/data/blog/test.md',
        expect.objectContaining({ next: expect.objectContaining({ tags: ['blog-index'] }) })
      )
      expect(result?.title).toBe('Test Post')
    })

    it('should support concurrent requests without rate limits', async () => {
      const mockData = [{ id: '1', content: 'Concurrent', timestamp: '2024-01-01' }]

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      // 20 concurrent requests
      const requests = Array.from({ length: 20 }, () => client.getMemos())
      const results = await Promise.all(requests)

      // ✅ All succeed without rate limits
      expect(results).toHaveLength(20)
      results.forEach(result => {
        expect(result).toEqual(mockData)
      })
      expect(global.fetch).toHaveBeenCalledTimes(20)
    })
  })

  describe('Error handling', () => {
    it('should handle 404s gracefully', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await client.getMemos()
      
      // ✅ Returns empty array for 404
      expect(result).toEqual([])
    })

    it('should handle missing blog posts', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await client.getBlogPost('missing.md')
      
      // ✅ Returns null for missing posts
      expect(result).toBeNull()
    })
  })

  describe('API endpoint verification', () => {
    it('should never call api.github.com endpoints', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
        text: () => Promise.resolve('# Test'),
      })

      // Make various requests
      await Promise.all([
        client.getMemos(),
        client.getLinks(),
        client.getBlogPost('test.md'),
        client.checkRepositoryHealth(),
      ])

      // ✅ Verify no API calls
      const fetchCalls = (global.fetch as jest.Mock).mock.calls
      const apiCalls = fetchCalls.filter(call => 
        call[0].includes('api.github.com')
      )
      expect(apiCalls).toHaveLength(0)

      // ✅ All use raw URLs
      fetchCalls.forEach(call => {
        expect(call[0]).toContain('raw.githubusercontent.com')
      })
    })
  })

  describe('getBlogPosts (live directory listing)', () => {
    it('lists the blog dir via the Contents API, then reads bodies from raw URLs', async () => {
      const listing = [
        { type: 'file', name: 'song-sound.md' },
        { type: 'file', name: '.gitkeep' }, // ignored
        { type: 'dir', name: 'nested' }, // ignored
      ]
      const body = `---\ntitle: Song\nstatus: published\ndate: 2026-07-24T00:00:00.000Z\n---\nbody`

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(listing) }) // Contents API
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(body) }) // raw body

      const posts = await client.getBlogPosts()

      // Listing goes through the Contents API...
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
        'https://api.github.com/repos/testuser/cici/contents/data/blog?ref=main'
      )
      // ...and the body is read from a raw URL (no API budget spent on content).
      expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe(
        'https://raw.githubusercontent.com/testuser/cici/main/data/blog/song-sound.md'
      )
      expect(posts).toHaveLength(1)
      expect(posts[0].title).toBe('Song')
    })

    it('degrades to an empty list when the directory listing fails (e.g. rate limited)', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 403, statusText: 'rate limited' })

      const posts = await client.getBlogPosts()
      expect(posts).toEqual([])
    })
  })

  describe('High traffic simulation', () => {
    it('should handle viral blog traffic', async () => {
      const mockPost = `---
title: Viral Post
---
This post is going viral!`

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockPost),
      })

      const startTime = Date.now()

      // Simulate 50 visitors reading the same post
      const visitors = Array.from({ length: 50 }, () => new PublicGitHubClient('viral-blogger'))
      const reads = visitors.map(v => v.getBlogPost('viral.md'))
      const results = await Promise.all(reads)

      const duration = Date.now() - startTime

      // ✅ All succeed quickly
      expect(results.filter(r => r !== null)).toHaveLength(50)
      expect(duration).toBeLessThan(1000) // Under 1 second
      expect(global.fetch).toHaveBeenCalledTimes(50)
    })
  })
})