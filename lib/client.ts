import { BlogPost, Memo } from './types'
import { LikesDatabase } from './likeUtils'
import { parseBlogPostMetadata } from './markdown'
import { extractTitleFromContent } from './titleUtils'

import { Octokit } from '@octokit/rest'
import { createHybridGitHubClient } from './publicClient'

const REPO = 'Cofe'

const getFirstImageURLFrom = (content: string): string | null => {
  const imgRegex = /(https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|gif|webp))/i
  const match = imgRegex.exec(content)
  if (match) {
    const url = match[1]
    return url.startsWith('https://github') ? `${url}?raw=true` : url
  }
  return null
}

class GitHubAPIClient {
  private accessToken: string

  constructor(token: string) {
    this.accessToken = token
  }

  private async getSafeOwner(owner?: string): Promise<string> {
    if (owner && owner !== 'true') {
      return owner
    }
    
    if (this.accessToken) {
      try {
        const octokit = new Octokit({ auth: this.accessToken })
        const { data: user } = await octokit.users.getAuthenticated()
        if (user.login && user.login !== 'true') {
          return user.login
        }
      } catch (error) {
        console.warn('Failed to get authenticated user:', error)
      }
    }
    
    // Fallback to environment variable or hardcoded default
    return process.env.GITHUB_USERNAME || 'metrue'
  }

  async getBlogPosts(owner?: string, includeAuthenticatedDrafts = false): Promise<BlogPost[]> {
    const octokit = this.accessToken ? new Octokit({ auth: this.accessToken }) : new Octokit()
    const safeOwner = await this.getSafeOwner(owner)
    try {
      const response = await octokit.repos.getContent({
        owner: safeOwner,
        repo: REPO,
        path: 'data/blog',
      })

      if (!Array.isArray(response.data)) {
        console.warn('Unexpected response from GitHub API: data is not an array')
        return []
      }

      const posts = await Promise.all(
        response.data
          .filter(
            (file) =>
              file.type === 'file' && file.name !== '.gitkeep' && file.name.endsWith('.md')
          )
          .map(async (file) => {
            return this.getBlogPost(file.name, safeOwner)
          })
      )

      const validPosts = posts.filter((post): post is BlogPost => post !== undefined)
      
      // Filter based on authentication and status
      if (includeAuthenticatedDrafts && this.accessToken) {
        // If authenticated and requesting drafts, return all posts
        return validPosts
      } else {
        // For public access, only return published posts
        return validPosts.filter(post => post.status === 'published')
      }
    } catch (error) {
      console.error('Error fetching blog posts:', error)
      // If the blog directory doesn't exist, return an empty array
      if (error instanceof Error && 'status' in error && error.status === 404) {
        console.log('Blog directory does not exist, returning empty array')
        return []
      }
      throw error
    }
  }

  async getBlogPost(name: string, owner?: string): Promise<BlogPost | undefined> {
    const octokit = this.accessToken ? new Octokit({ auth: this.accessToken }) : new Octokit()
    const safeOwner = await this.getSafeOwner(owner)

    const contentResponse = await octokit.repos.getContent({
      owner: safeOwner,
      repo: REPO,
      path: `data/blog/${name}`,
    })

    if ('content' in contentResponse.data) {
      const content = Buffer.from(contentResponse.data.content, 'base64').toString('utf-8')
      const metadata = parseBlogPostMetadata(content)

      // Extract title from H1 in content, fallback to frontmatter title
      const extractedTitle = extractTitleFromContent(content)
      const frontmatterTitle = metadata.title
        ? decodeURIComponent(metadata.title)
        : decodeURIComponent(name.replace('.md', ''))
      const finalTitle = extractedTitle || frontmatterTitle

      return {
        id: name.replace('.md', ''),
        title: finalTitle,
        content,
        imageUrl: getFirstImageURLFrom(content),
        date: metadata.date ? new Date(metadata.date).toISOString() : new Date().toISOString(),
        discussions: metadata.discussions.length > 0 ? metadata.discussions : undefined,
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        city: metadata.city,
        street: metadata.street,
        status: metadata.status || 'published', // Default to published for existing posts
        publishedAt: metadata.publishedAt || metadata.date,
        lastModified: metadata.lastModified || metadata.date || new Date().toISOString()
      }
    }
  }

  async getMemos(owner?: string): Promise<Memo[]> {
    const octokit = this.accessToken ? new Octokit({ auth: this.accessToken }) : new Octokit()
    const safeOwner = await this.getSafeOwner(owner)
    try {
      const response = await octokit.repos.getContent({
        owner: safeOwner,
        repo: REPO,
        path: 'data/memos.json',
      })

      if (Array.isArray(response.data) || !('content' in response.data)) {
        return []
      }

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8')
      return JSON.parse(content) as Memo[]
    } catch (error) {
      console.error('Error fetching public memos:', error)
      return []
    }
  }

  async getLinks(owner?: string): Promise<Record<string, string>> {
    const octokit = this.accessToken ? new Octokit({ auth: this.accessToken }) : new Octokit()
    const safeOwner = await this.getSafeOwner(owner)
    try {
      const response = await octokit.repos.getContent({
        owner: safeOwner,
        repo: REPO,
        path: 'data/site-config.json',
      })
      if (Array.isArray(response.data) || !('content' in response.data)) {
        return {}
      }
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8')
      const config = JSON.parse(content)
      return config.links || {}
    } catch (error) {
      console.warn('Error fetching links:', error)
      return {}
    }
  }

  async getLikes(owner?: string): Promise<LikesDatabase> {
    const octokit = this.accessToken ? new Octokit({ auth: this.accessToken }) : new Octokit()
    const safeOwner = await this.getSafeOwner(owner)
    try {
      const response = await octokit.repos.getContent({
        owner: safeOwner,
        repo: REPO,
        path: 'data/likes.json',
      })

      if (Array.isArray(response.data) || !('content' in response.data)) {
        return {}
      }

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8')
      return JSON.parse(content) as LikesDatabase
    } catch (error) {
      console.error('Error fetching likes:', error)
      // If likes.json doesn't exist, return empty object
      if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
        return {}
      }
      throw error
    }
  }

  async updateLikes(likesData: LikesDatabase, owner?: string): Promise<void> {
    const octokit = new Octokit({ auth: this.accessToken })
    const safeOwner = await this.getSafeOwner(owner)

    try {
      // Get current file to get its SHA
      let sha: string | undefined
      try {
        const currentFile = await octokit.repos.getContent({
          owner: safeOwner,
          repo: REPO,
          path: 'data/likes.json',
        })

        if (!Array.isArray(currentFile.data) && 'sha' in currentFile.data) {
          sha = currentFile.data.sha
        }
      } catch (error) {
        // File doesn't exist, sha will be undefined for create operation
      }

      // Update or create the file
      await octokit.repos.createOrUpdateFileContents({
        owner: safeOwner,
        repo: REPO,
        path: 'data/likes.json',
        message: `Update likes data - ${new Date().toISOString()}`,
        content: Buffer.from(JSON.stringify(likesData, null, 2)).toString('base64'),
        ...(sha && { sha }),
      })
    } catch (error) {
      console.error('Error updating likes:', error)
      throw new Error('Failed to update likes data')
    }
  }

  async getDrafts(owner?: string): Promise<BlogPost[]> {
    const allPosts = await this.getBlogPosts(owner, true)
    return allPosts.filter(post => post.status === 'draft')
  }

  async getAllBlogPosts(owner?: string): Promise<BlogPost[]> {
    return this.getBlogPosts(owner, true)
  }
}

export const createGitHubAPIClient = (token: string) => new GitHubAPIClient(token)

/**
 * Create a client that prioritizes raw GitHub URLs for public reads
 * Falls back to API for authenticated operations
 */
export const createOptimizedGitHubClient = (owner: string, token?: string) => {
  // In production, use GitHub clients
  if (token) {
    // For authenticated users, use hybrid approach
    return createHybridGitHubClient(owner, token)
  } else {
    // For public users, use raw URLs only
    return createHybridGitHubClient(owner)
  }
}

/**
 * Create a client that uses local data in development, GitHub in production
 * Only works on server-side due to fs dependency
 */
export const createDevelopmentOptimizedClient = async (owner: string, token?: string) => {
  // Only use local client on server-side in development
  if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
    const { createLocalFileSystemClient } = await import('./localClient.server')
    return createLocalFileSystemClient()
  }
  
  // In production or client-side, use GitHub clients
  return createOptimizedGitHubClient(owner, token)
}
