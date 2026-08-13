import fs from 'fs'
import path from 'path'
import { LocalFileSystemClient } from '../../lib/localClient.server'
import type { LikesDatabase } from '../../lib/likeUtils'

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}))

// Mock process.cwd
const mockCwd = jest.spyOn(process, 'cwd')

const mockFs = {
  existsSync: fs.existsSync as jest.MockedFunction<typeof fs.existsSync>,
  readdirSync: fs.readdirSync as jest.MockedFunction<typeof fs.readdirSync>,
  readFileSync: fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>,
  writeFileSync: fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>,
}

describe('LocalFileSystemClient', () => {
  let client: LocalFileSystemClient
  const mockDataDir = '/mock/project/data'
  const mockBlogDir = '/mock/project/data/blog'

  beforeEach(() => {
    client = new LocalFileSystemClient()
    mockCwd.mockReturnValue('/mock/project')
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('getBlogPosts', () => {
    it('should return empty array when blog directory does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = await client.getBlogPosts()

      expect(result).toEqual([])
      expect(mockFs.existsSync).toHaveBeenCalledWith(mockBlogDir)
    })

    it('should return blog posts when directory exists', async () => {
      const mockFiles = ['post1.md', 'post2.md', '.gitkeep', 'not-markdown.txt']
      const mockPost1Content = `---
title: Post 1
date: 2025-01-01
---

# Post 1

Content for post 1`

      const mockPost2Content = `---
title: Post 2
date: 2025-01-02
---

# Post 2

Content for post 2`

      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === mockBlogDir) return true
        if (filePath === path.join(mockBlogDir, 'post1.md')) return true
        if (filePath === path.join(mockBlogDir, 'post2.md')) return true
        return false
      })

      mockFs.readdirSync.mockReturnValue(mockFiles as any)
      
      mockFs.readFileSync.mockImplementation((filePath) => {
        if (filePath === path.join(mockBlogDir, 'post1.md')) return mockPost1Content
        if (filePath === path.join(mockBlogDir, 'post2.md')) return mockPost2Content
        return ''
      })

      const result = await client.getBlogPosts()

      expect(result).toHaveLength(2)
      expect(result[0].title).toBe('Post 2') // Sorted by date, newest first
      expect(result[1].title).toBe('Post 1')
      expect(mockFs.readdirSync).toHaveBeenCalledWith(mockBlogDir)
    })

    it('should handle errors gracefully', async () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('File system error')
      })

      const result = await client.getBlogPosts()

      expect(result).toEqual([])
    })
  })

  describe('getBlogPost', () => {
    it('should return null when file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = await client.getBlogPost('nonexistent.md')

      expect(result).toBeNull()
    })

    it('should return blog post when file exists', async () => {
      const mockContent = `---
title: Test Post
date: 2025-01-01
external_discussions:
  - platform: v2ex
    url: https://v2ex.com/t/123456
---

# Test Post

Test content here.
![image](https://example.com/image.jpg)`

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(mockContent)

      const result = await client.getBlogPost('test.md')

      expect(result).not.toBeNull()
      expect(result?.title).toBe('Test Post')
      expect(result?.id).toBe('test')
      expect(result?.imageUrl).toBe('https://example.com/image.jpg')
      expect(result?.discussions).toHaveLength(1)
    })
  })

  describe('getMemos', () => {
    it('should return empty array when memos.json does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = await client.getMemos()

      expect(result).toEqual([])
    })

    it('should return memos when file exists', async () => {
      const mockMemos = [
        { id: '1', content: 'Test memo 1', timestamp: '2025-01-01T00:00:00Z' },
        { id: '2', content: 'Test memo 2', timestamp: '2025-01-02T00:00:00Z' }
      ]

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockMemos))

      const result = await client.getMemos()

      expect(result).toEqual(mockMemos)
    })

    it('should handle invalid JSON gracefully', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('invalid json')

      const result = await client.getMemos()

      expect(result).toEqual([])
    })
  })

  describe('createMemo', () => {
    it('should create new memo and add to beginning of list', async () => {
      const existingMemos = [
        { id: '1', content: 'Existing memo', timestamp: '2025-01-01T00:00:00Z' }
      ]
      const newMemo = {
        id: '2',
        content: 'New memo',
        timestamp: '2025-01-02T00:00:00Z'
      }

      // Mock getMemos to return existing memos
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingMemos))

      const result = await client.createMemo(newMemo)

      expect(result).toEqual(newMemo)
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockDataDir, 'memos.json'),
        JSON.stringify([newMemo, ...existingMemos], null, 2),
        'utf-8'
      )
    })
  })

  describe('updateLikes', () => {
    it('should write likes data to file', async () => {
      const likesData: LikesDatabase = {
        'blog:test-post': {
          'like1': { 
            timestamp: '2025-01-01T00:00:00Z', 
            country: 'US',
            userAgent: 'test-agent',
            language: 'en'
          }
        }
      }

      await client.updateLikes(likesData)

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockDataDir, 'likes.json'),
        JSON.stringify(likesData, null, 2),
        'utf-8'
      )
    })
  })

  describe('getLikes', () => {
    it('should return empty object when likes.json does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = await client.getLikes()

      expect(result).toEqual({})
    })

    it('should return likes data when file exists', async () => {
      const mockLikes: LikesDatabase = {
        'blog:test-post': {
          'like1': { 
            timestamp: '2025-01-01T00:00:00Z', 
            country: 'US',
            userAgent: 'test-agent',
            language: 'en'
          }
        }
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockLikes))

      const result = await client.getLikes()

      expect(result).toEqual(mockLikes)
    })
  })

  describe('getLinks', () => {
    it('should return empty object when site-config.json does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = await client.getLinks()

      expect(result).toEqual({})
    })

    it('should return links when file exists', async () => {
      const mockConfig = {
        links: {
          twitter: 'https://twitter.com/test',
          github: 'https://github.com/test'
        }
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      const result = await client.getLinks()

      expect(result).toEqual(mockConfig.links)
    })
  })

  describe('checkRepositoryHealth', () => {
    it('should return true when data directory exists', async () => {
      mockFs.existsSync.mockReturnValue(true)

      const result = await client.checkRepositoryHealth()

      expect(result).toBe(true)
      expect(mockFs.existsSync).toHaveBeenCalledWith(mockDataDir)
    })

    it('should return false when data directory does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = await client.checkRepositoryHealth()

      expect(result).toBe(false)
    })
  })
})