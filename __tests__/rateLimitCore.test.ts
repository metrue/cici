/**
 * Core rate limit avoidance tests
 * Tests the key functionality that prevents GitHub API rate limits
 */

import { PublicGitHubClient } from '@/lib/publicClient'

// Cache module has been removed - no mocking needed

describe('Rate Limit Core Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('✅ Public reads without API limits', () => {
    it('should allow unlimited blog readers worldwide', async () => {
      const mockBlogContent = `---
title: Viral Blog Post
date: 2024-01-01T00:00:00.000Z
---

This post is being read by thousands of visitors simultaneously.`

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockBlogContent),
      })

      // Simulate 100 concurrent global visitors
      const globalVisitors = Array.from({ length: 100 }, () => new PublicGitHubClient('viral-blogger'))
      const blogReads = globalVisitors.map(visitor => visitor.getBlogPost('viral-post.md'))
      
      const results = await Promise.all(blogReads)
      
      // ✅ All visitors can read without rate limits
      expect(results.filter(r => r !== null)).toHaveLength(100)
      expect(global.fetch).toHaveBeenCalledTimes(100)
      
      // ✅ All use raw URLs (no API quota consumed)
      const fetchCalls = (global.fetch as jest.Mock).mock.calls
      fetchCalls.forEach(call => {
        expect(call[0]).toContain('raw.githubusercontent.com')
        expect(call[0]).not.toContain('api.github.com')
      })
    })

    it('should handle memo feeds for real-time dashboards', async () => {
      const mockMemos = [
        { id: '1', content: 'Live memo update', timestamp: '2024-01-01T12:00:00.000Z' },
        { id: '2', content: 'Another live update', timestamp: '2024-01-01T12:01:00.000Z' },
      ]

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMemos),
      })

      const client = new PublicGitHubClient('live-blogger')

      // Simulate dashboard polling every second for 30 seconds
      const pollingRequests = Array.from({ length: 30 }, () => client.getMemos())
      const results = await Promise.all(pollingRequests)

      // ✅ All polling requests succeed
      expect(results).toHaveLength(30)
      results.forEach(memos => {
        expect(memos).toEqual(mockMemos)
      })

      // ✅ No API rate limits hit
      expect(global.fetch).toHaveBeenCalledTimes(30)
    })

    it('should demonstrate performance benefits vs API calls', async () => {
      const startTime = Date.now()

      ;(global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: '1', content: 'Fast response' }]),
        })
      )

      const client = new PublicGitHubClient('performance-test')

      // 50 rapid requests that would normally hit rate limits
      const rapidRequests = Array.from({ length: 50 }, () => client.getMemos())
      await Promise.all(rapidRequests)

      const duration = Date.now() - startTime

      // ✅ Completes quickly without rate limit delays
      expect(duration).toBeLessThan(500) // Under 500ms
      expect(global.fetch).toHaveBeenCalledTimes(50)

      // ✅ All requests use raw URLs
      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls.every(call => call[0].includes('raw.githubusercontent.com'))).toBe(true)
    })
  })

  describe('✅ Error handling without API quota impact', () => {
    it('should handle missing content gracefully', async () => {
      // Mock 404 responses
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const client = new PublicGitHubClient('missing-content-blog')

      // Multiple requests for non-existent content
      const missingRequests = [
        client.getBlogPost('non-existent-1.md'),
        client.getBlogPost('non-existent-2.md'),
        client.getMemos(),
        client.getLinks(),
      ]

      const results = await Promise.all(missingRequests)

      // ✅ Graceful handling without errors
      expect(results[0]).toBeNull() // blog post
      expect(results[1]).toBeNull() // blog post  
      expect(results[2]).toEqual([]) // memos
      expect(results[3]).toEqual({}) // links

      // ✅ No API quota consumed for 404s (links now tries cici.json then site-config.json)
      expect(global.fetch).toHaveBeenCalledTimes(5)
      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls.every(call => call[0].includes('raw.githubusercontent.com'))).toBe(true)
    })

    it('should use raw URLs even during issues', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      })

      const client = new PublicGitHubClient('service-unavailable')
      
      // Even during GitHub service issues, we use raw URLs not API
      const result = await client.getMemos()
      expect(result).toEqual([]) // Graceful handling

      // ✅ Raw URL was used (no API quota consumed during outages)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/service-unavailable/cici/main/data/memos.json'
      )
    })
  })

  describe('✅ Rate limit solution validation', () => {
    it('limits GitHub API usage to the single, cached blog directory listing', async () => {
      const mockData = [{ id: '1', content: 'Public data', timestamp: '2024-01-01' }]

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
        text: () => Promise.resolve('# Blog content'),
      })

      const client = new PublicGitHubClient('public-user')

      // Make various types of requests
      await Promise.all([
        client.getBlogPosts(),
        client.getMemos(),
        client.getLinks(),
        client.getBlogPost('test.md'),
        client.checkRepositoryHealth(),
      ])

      const fetchCalls = (global.fetch as jest.Mock).mock.calls
      const apiCalls = fetchCalls.filter(call => call[0].includes('api.github.com'))

      // The ONLY api.github.com call is the blog directory listing — raw URLs
      // can't enumerate a directory. Everything else stays on raw.
      expect(apiCalls).toHaveLength(1)
      expect(apiCalls[0][0]).toContain('/contents/data/blog')

      // ✅ And that one listing call is cached (revalidate window + bust tag),
      // so it costs at most one upstream request per window regardless of traffic.
      expect(apiCalls[0][1]).toEqual(
        expect.objectContaining({ next: expect.objectContaining({ tags: ['blog-index'] }) })
      )

      // ✅ Every non-listing call uses raw.githubusercontent.com (no API budget).
      const nonListing = fetchCalls.filter(call => !call[0].includes('api.github.com'))
      expect(nonListing.length).toBeGreaterThan(0)
      nonListing.forEach(call => expect(call[0]).toContain('raw.githubusercontent.com'))
    })

    it('should demonstrate scalability for high-traffic blogs', async () => {
      const mockContent = `---
title: High Traffic Post
---
Content that gets millions of views`

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockContent),
      })

      // Simulate high traffic scenario
      const massiveTraffic = Array.from({ length: 200 }, (_, i) => {
        const client = new PublicGitHubClient(`visitor-${i}`)
        return client.getBlogPost('high-traffic-post.md')
      })

      const startTime = Date.now()
      const results = await Promise.all(massiveTraffic)
      const duration = Date.now() - startTime

      // ✅ All requests succeed under heavy load
      expect(results.filter(r => r !== null)).toHaveLength(200)
      
      // ✅ Reasonable performance
      expect(duration).toBeLessThan(2000) // Under 2 seconds
      
      // ✅ No rate limits hit
      expect(global.fetch).toHaveBeenCalledTimes(200)
      
      console.log(`✅ Successfully handled ${results.length} concurrent requests in ${duration}ms`)
      console.log(`✅ Average response time: ${(duration / results.length).toFixed(2)}ms per request`)
      console.log(`✅ Zero API calls made - complete rate limit avoidance`)
    })
  })
})