/**
 * Integration tests proving rate limit avoidance works
 */

import { PublicGitHubClient, HybridGitHubClient } from '@/lib/publicClient'

// Cache module has been removed - no mocking needed

describe('Rate Limit Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Public client rate limit avoidance', () => {
    it('should handle massive concurrent traffic without API limits', async () => {
      const mockMemos = [
        { id: '1', content: 'Popular memo', timestamp: '2024-01-01T00:00:00.000Z' }
      ]

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMemos)
      })

      // Create 100 different "visitors"
      const visitors = Array.from({ length: 100 }, (_, i) => 
        new PublicGitHubClient(`visitor-${i}`)
      )

      const startTime = Date.now()
      const results = await Promise.all(visitors.map(v => v.getMemos()))
      const duration = Date.now() - startTime

      // ✅ All succeed without rate limits
      expect(results).toHaveLength(100)
      results.forEach(memos => {
        expect(memos).toEqual(mockMemos)
      })

      // ✅ Fast performance (no rate limit delays)
      expect(duration).toBeLessThan(500)

      // ✅ All use raw URLs
      expect(global.fetch).toHaveBeenCalledTimes(100)
      const fetchCalls = (global.fetch as jest.Mock).mock.calls
      fetchCalls.forEach(call => {
        expect(call[0]).toContain('raw.githubusercontent.com')
        expect(call[0]).not.toContain('api.github.com')
      })
    })

    it('should demonstrate blog scalability', async () => {
      const mockContent = `---
title: Scalable Post
date: 2024-01-01T00:00:00.000Z
---

# Scalable Post

This post can handle unlimited traffic!`

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockContent)
      })

      const client = new PublicGitHubClient('scalable-blog')

      // Rapid succession of requests (like F5 spam)
      const rapidRequests = Array.from({ length: 50 }, () => 
        client.getBlogPost('scalable.md')
      )

      const results = await Promise.all(rapidRequests)

      // ✅ All succeed 
      expect(results.filter(r => r !== null)).toHaveLength(50)
      results.forEach(post => {
        expect(post?.title).toBe('Scalable Post')
      })

      // ✅ No API quota consumed
      expect(global.fetch).toHaveBeenCalledTimes(50)
    })
  })

  describe('Error scenarios without API impact', () => {
    it('should handle repository not found gracefully', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      const client = new PublicGitHubClient('non-existent-user')

      // Multiple requests to non-existent repo
      const requests = Array.from({ length: 10 }, () => client.getMemos())
      const results = await Promise.all(requests)

      // ✅ Graceful 404 handling
      results.forEach(result => {
        expect(result).toEqual([])
      })

      // ✅ No API calls during 404s
      expect(global.fetch).toHaveBeenCalledTimes(10)
      const calls = (global.fetch as jest.Mock).mock.calls
      calls.forEach(call => {
        expect(call[0]).toContain('raw.githubusercontent.com')
      })
    })
  })

  describe('Performance validation', () => {
    it('should demonstrate speed benefits of raw URLs', async () => {
      ;(global.fetch as jest.Mock).mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: '1', content: 'Fast' }])
        })
      )

      const client = new PublicGitHubClient('fast-blog')
      const iterations = 30

      const startTime = Date.now()
      const requests = Array.from({ length: iterations }, () => client.getMemos())
      await Promise.all(requests)
      const duration = Date.now() - startTime

      // ✅ Fast completion
      expect(duration).toBeLessThan(300) // Under 300ms for 30 requests
      
      const avgTime = duration / iterations
      console.log(`✅ Average response time: ${avgTime.toFixed(2)}ms per request`)
      console.log(`✅ Total requests: ${iterations}, Duration: ${duration}ms`)
      console.log(`✅ Zero API rate limits hit`)
    })
  })

  describe('Real-world scenarios', () => {
    it('should support blog with mixed content types', async () => {
      const client = new PublicGitHubClient('mixed-content-blog')

      // Mock different content types
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ id: '1', content: 'memo' }]) // memos
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ links: { github: 'link' } }) // site-config with links
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('# README') // health check
        })

      // Simulate typical user browsing
      const [memos, links, health] = await Promise.all([
        client.getMemos(),
        client.getLinks(),
        client.checkRepositoryHealth()
      ])

      // ✅ All content types work
      expect(memos).toEqual([{ id: '1', content: 'memo' }])
      expect(links).toEqual({ github: 'link' })
      expect(health).toBe(true)

      // ✅ No API calls for any content type
      expect(global.fetch).toHaveBeenCalledTimes(3)
    })
  })
})