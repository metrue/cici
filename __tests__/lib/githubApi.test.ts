/**
 * Unit tests for githubApi.ts module
 * Covers blog post / memo GitHub operations. Blog listings no longer use a
 * manifest, so create/update/delete must NOT write data/blog-manifest.json.
 */

import {
  createBlogPost,
  deleteBlogPost,
  createMemo,
  deleteMemo,
  updateMemo,
  updateBlogPost,
  uploadImage,
  getUserLogin,
  getIconUrls,
} from '@/lib/githubApi'
import { Octokit } from '@octokit/rest'

// Mock dependencies
jest.mock('@/lib/githubUtils', () => ({
  getOctokit: jest.fn(() => new Octokit()),
  getRepoInfo: jest.fn(() => Promise.resolve({ owner: 'testuser', repo: 'cici' })),
  getFileContent: jest.fn(),
  updateFileContents: jest.fn(),
  ensureDirectoryExists: jest.fn(),
  fileToBase64: jest.fn(),
  isNotFoundError: jest.fn(),
  createFileIfNotExists: jest.fn(),
}))

describe('githubApi', () => {
  let mockOctokit: any

  beforeEach(() => {
    jest.clearAllMocks()
    mockOctokit = {
      repos: {
        get: jest.fn(),
        getContent: jest.fn(),
        createOrUpdateFileContents: jest.fn(),
        deleteFile: jest.fn(),
        update: jest.fn(),
        createForAuthenticatedUser: jest.fn(),
      },
      users: {
        getAuthenticated: jest.fn(),
      },
    } as any
    
    // Setup default successful responses for common operations
    ;(mockOctokit.repos.get as jest.MockedFunction<any>).mockResolvedValue({ 
      data: { description: 'test repo', default_branch: 'main' } 
    })
    ;(mockOctokit.users.getAuthenticated as unknown as jest.Mock).mockResolvedValue({ 
      data: { login: 'testuser' } 
    })
    // Default mock for blog manifest (empty, doesn't exist)
    ;(mockOctokit.repos.getContent as unknown as jest.Mock).mockImplementation((params: any) => {
      if (params.path === 'data/blog-manifest.json') {
        throw { status: 404 } // manifest doesn't exist by default
      }
      return Promise.resolve({ data: { content: 'dGVzdA==', sha: 'test-sha' } })
    })
    ;(mockOctokit.repos.createOrUpdateFileContents as unknown as jest.Mock).mockResolvedValue({ 
      data: {} 
    })
    
    // Setup default mocks
    const { getOctokit, getRepoInfo, isNotFoundError, createFileIfNotExists } = require('@/lib/githubUtils')
    getOctokit.mockReturnValue(mockOctokit)
    getRepoInfo.mockResolvedValue({ owner: 'testuser', repo: 'cici' })
    isNotFoundError.mockImplementation((error: any) => error.status === 404)
    createFileIfNotExists.mockResolvedValue({})
  })

  describe('createBlogPost', () => {
    it('should create the blog post file', async () => {
      const { isNotFoundError } = require('@/lib/githubUtils')
      isNotFoundError.mockImplementation((error: any) => error.status === 404)

      await createBlogPost('Test Post', 'This is test content', 'fake-token')

      // Verify blog post creation call
      expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'data/blog/test-post.md',
          message: 'Add blog post: Test Post',
        })
      )
    })

    it('should NOT write a blog manifest', async () => {
      const { isNotFoundError } = require('@/lib/githubUtils')
      isNotFoundError.mockImplementation((error: any) => error.status === 404)

      await createBlogPost('New Post', 'New content', 'fake-token')

      // Listings enumerate the repo live now — no manifest is written.
      expect(mockOctokit.repos.createOrUpdateFileContents).not.toHaveBeenCalledWith(
        expect.objectContaining({ path: 'data/blog-manifest.json' })
      )
    })
  })

  describe('deleteBlogPost', () => {
    it('should delete the blog post file without touching a manifest', async () => {
      mockOctokit.repos.getContent
        .mockReset()
        .mockImplementation((params: any) => {
          if (params.path === 'data/blog/post-to-delete.md') {
            return Promise.resolve({ data: { sha: 'file-sha' } })
          }
          throw { status: 404 }
        })

      mockOctokit.repos.deleteFile.mockResolvedValueOnce({ data: {} } as any)

      await deleteBlogPost('post-to-delete', 'fake-token')

      // Verify file deletion
      expect(mockOctokit.repos.deleteFile).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'cici',
        path: 'data/blog/post-to-delete.md',
        message: 'Delete blog post',
        sha: 'file-sha',
      })

      // No manifest is written back.
      expect(mockOctokit.repos.createOrUpdateFileContents).not.toHaveBeenCalledWith(
        expect.objectContaining({ path: 'data/blog-manifest.json' })
      )
    })

    it('should handle URL-encoded blog post IDs', async () => {
      const encodedId = encodeURIComponent('四月的尾巴逛德国-柏林')
      const manifest = { files: ['四月的尾巴逛德国-柏林.md'] }
      
      mockOctokit.repos.getContent
        .mockReset()
        .mockImplementation((params: any) => {
          if (params.path.endsWith('.md')) {
            return Promise.resolve({ data: { sha: 'file-sha' } })
          }
          if (params.path === 'data/blog-manifest.json') {
            return Promise.resolve({
              data: { 
                content: Buffer.from(JSON.stringify(manifest)).toString('base64'), 
                sha: 'manifest-sha' 
              }
            })
          }
          return Promise.resolve({ data: { content: 'dGVzdA==', sha: 'test-sha' } })
        })

      mockOctokit.repos.deleteFile.mockResolvedValueOnce({ data: {} } as any)

      await deleteBlogPost(encodedId, 'fake-token')

      expect(mockOctokit.repos.deleteFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'data/blog/四月的尾巴逛德国-柏林.md',
          message: 'Delete blog post',
          sha: 'file-sha',
        })
      )
    })
  })

  describe('createMemo', () => {
    it('should create a memo with existing memos', async () => {
      const existingMemos = [
        { id: '1', content: 'Existing memo', timestamp: '2024-01-01T00:00:00.000Z' }
      ]

      ;(mockOctokit.repos.getContent as unknown as jest.Mock)
        .mockReset()
        .mockImplementation((params: any) => {
          if (params.path === 'data/memos.json') {
            return Promise.resolve({
              data: { 
                content: Buffer.from(JSON.stringify(existingMemos)).toString('base64'), 
                sha: 'memos-sha' 
              }
            })
          }
          return Promise.resolve({ data: { content: 'dGVzdA==', sha: 'test-sha' } })
        })

      await createMemo('New memo content', undefined, 'fake-token')

      // Should have called createOrUpdateFileContents for memos.json
      expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'data/memos.json',
          message: 'Add new memo',
        })
      )
    })

    it('should create a memo with image', async () => {
      ;(mockOctokit.repos.getContent as unknown as jest.Mock)
        .mockReset()
        .mockImplementation((params: any) => {
          if (params.path === 'data/memos.json') {
            throw { status: 404 } // no existing memos
          }
          return Promise.resolve({ data: { content: 'dGVzdA==', sha: 'test-sha' } })
        })

      const { isNotFoundError } = require('@/lib/githubUtils')
      isNotFoundError.mockImplementation((error: any) => error.status === 404)

      await createMemo('Memo with image', 'https://example.com/image.jpg', 'fake-token')

      expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'data/memos.json',
          message: 'Add new memo',
        })
      )
    })
  })

  describe('updateMemo', () => {
    it('should update an existing memo', async () => {
      const existingMemos = [
        { id: '1', content: 'Original content', timestamp: '2024-01-01T00:00:00.000Z' },
        { id: '2', content: 'Other memo', timestamp: '2024-01-02T00:00:00.000Z' }
      ]

      ;(mockOctokit.repos.getContent as unknown as jest.Mock)
        .mockReset()
        .mockImplementation((params: any) => {
          if (params.path === 'data/memos.json') {
            return Promise.resolve({
              data: { 
                content: Buffer.from(JSON.stringify(existingMemos)).toString('base64'), 
                sha: 'memos-sha' 
              }
            })
          }
          return Promise.resolve({ data: { content: 'dGVzdA==', sha: 'test-sha' } })
        })

      await updateMemo('1', 'Updated content', 'fake-token')

      expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'data/memos.json',
          message: 'Update memo',
        })
      )
    })

    it('should throw error for non-existent memo', async () => {
      const existingMemos = [
        { id: '1', content: 'Existing memo', timestamp: '2024-01-01T00:00:00.000Z' }
      ]

      ;(mockOctokit.repos.getContent as unknown as jest.Mock)
        .mockReset()
        .mockImplementation((params: any) => {
          if (params.path === 'data/memos.json') {
            return Promise.resolve({
              data: { 
                content: Buffer.from(JSON.stringify(existingMemos)).toString('base64'), 
                sha: 'memos-sha' 
              }
            })
          }
          return Promise.resolve({ data: { content: 'dGVzdA==', sha: 'test-sha' } })
        })

      await expect(updateMemo('999', 'Updated content', 'fake-token'))
        .rejects.toThrow('Memo not found')
    })
  })

  describe('deleteMemo', () => {
    it('should delete a memo from the list', async () => {
      const existingMemos = [
        { id: '1', content: 'Memo to delete', timestamp: '2024-01-01T00:00:00.000Z' },
        { id: '2', content: 'Memo to keep', timestamp: '2024-01-02T00:00:00.000Z' }
      ]

      ;(mockOctokit.repos.getContent as unknown as jest.Mock)
        .mockReset()
        .mockImplementation((params: any) => {
          if (params.path === 'data/memos.json') {
            return Promise.resolve({
              data: { 
                content: Buffer.from(JSON.stringify(existingMemos)).toString('base64'), 
                sha: 'memos-sha' 
              }
            })
          }
          return Promise.resolve({ data: { content: 'dGVzdA==', sha: 'test-sha' } })
        })

      await deleteMemo('1', 'fake-token')

      expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'data/memos.json',
          message: 'Delete a memo',
        })
      )
    })
  })

  describe('updateBlogPost', () => {
    it('should update blog post content while preserving date', async () => {
      const existingContent = `---
title: Original Title
date: 2024-01-01T00:00:00.000Z
---

Original content`

      const { getFileContent } = require('@/lib/githubUtils')
      getFileContent.mockResolvedValueOnce({
        content: existingContent,
        sha: 'file-sha'
      })

      const { updateFileContents } = require('@/lib/githubUtils')
      updateFileContents.mockResolvedValueOnce({})

      await updateBlogPost('test-post', 'Updated Title', 'Updated content', 'fake-token')

      expect(updateFileContents).toHaveBeenCalledWith(
        mockOctokit,
        'testuser',
        'cici',
        'data/blog/test-post.md',
        'Update blog post',
        expect.stringContaining('Updated Title'),
        'file-sha'
      )

      const updatedContent = updateFileContents.mock.calls[0][5]
      expect(updatedContent).toContain('date: 2024-01-01T00:00:00.000Z') // date preserved
      expect(updatedContent).toContain('Updated content')
    })
  })

  describe('getUserLogin', () => {
    it('should return user name if available', async () => {
      ;(mockOctokit.users.getAuthenticated as unknown as jest.Mock).mockResolvedValueOnce({
        data: { name: 'John Doe', login: 'johndoe' }
      })

      const result = await getUserLogin('fake-token')
      expect(result).toBe('John Doe')
    })

    it('should return login if name is not available', async () => {
      ;(mockOctokit.users.getAuthenticated as unknown as jest.Mock).mockResolvedValueOnce({
        data: { name: null, login: 'johndoe' }
      })

      const result = await getUserLogin('fake-token')
      expect(result).toBe('johndoe')
    })
  })

  describe('getIconUrls', () => {
    it('should return GitHub avatar URLs for username', async () => {
      const result = await getIconUrls('testuser')
      
      expect(result.iconPath).toBe('https://github.com/testuser.png')
      expect(result.appleTouchIconPath).toBe('https://github.com/testuser.png')
    })

    it('should check for custom icons when access token provided', async () => {
      const longToken = 'a'.repeat(50) // Long token to trigger token detection
      
      ;(mockOctokit.repos.getContent as unknown as jest.Mock)
        .mockResolvedValueOnce({ data: {} }) // icon exists
        .mockResolvedValueOnce({ data: {} }) // apple-touch-icon exists

      const result = await getIconUrls(longToken)
      
      expect(result.iconPath).toBe('https://github.com/testuser/cici/blob/main/assets/icon.jpg?raw=true')
      expect(result.appleTouchIconPath).toBe('https://github.com/testuser/cici/blob/main/assets/icon-144.jpg?raw=true')
    })
  })

  describe('uploadImage', () => {
    it('should upload image with proper path and return URL', async () => {
      const mockFile = new File(['image content'], 'test.jpg', { type: 'image/jpeg' })
      
      // Mock the upload response with proper structure
      ;(mockOctokit.repos.createOrUpdateFileContents as unknown as jest.Mock).mockResolvedValueOnce({
        data: {
          content: {
            download_url: 'https://raw.githubusercontent.com/testuser/cici/main/assets/images/2024-01-01/123456.jpg'
          }
        }
      })

      const { fileToBase64, ensureDirectoryExists } = require('@/lib/githubUtils')
      fileToBase64.mockResolvedValueOnce('base64content')
      ensureDirectoryExists.mockResolvedValueOnce({})

      // Mock Date and Date.now more carefully
      const realDate = Date
      const realDateNow = Date.now
      const mockDate = new Date('2024-01-01T00:00:00.000Z')
      
      // Mock the Date constructor
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any)
      // Mock Date.now
      Date.now = jest.fn(() => 123456)

      const result = await uploadImage(mockFile, 'fake-token')
      
      expect(result).toBe('https://github.com/testuser/cici/blob/main/assets/images/2024-01-01/123456.jpg?raw=true')
      expect(ensureDirectoryExists).toHaveBeenCalled()

      // Restore Date
      global.Date = realDate as any
      Date.now = realDateNow
    })
  })

  describe('error handling', () => {
    it('should handle missing access token', async () => {
      const { getOctokit } = require('@/lib/githubUtils')
      getOctokit.mockImplementation((token: string) => {
        if (!token) throw new Error('Access token is required')
        return mockOctokit
      })

      await expect(createBlogPost('Test', 'Content', ''))
        .rejects.toThrow('Access token is required')
      
      await expect(createMemo('Test memo', undefined, ''))
        .rejects.toThrow('Access token is required')
      
      await expect(deleteMemo('1', ''))
        .rejects.toThrow('Access token is required')
    })

    it('should handle GitHub API errors in repo operations', async () => {
      ;(mockOctokit.repos.get as unknown as jest.Mock).mockRejectedValueOnce(new Error('Repo not found'))
      
      await expect(createMemo('Test memo', undefined, 'fake-token'))
        .rejects.toThrow('Repo not found')
    })
  })
})