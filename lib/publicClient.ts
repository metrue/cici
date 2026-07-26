import { BlogPost, Memo } from './types'
import { createGitHubAPIClient } from './client'
import { LikesDatabase } from './likeUtils'
import { parseBlogPostMetadata } from './markdown'
import { contentPaths } from './content/paths'
import { BLOG_INDEX_TAG, BLOG_INDEX_REVALIDATE } from './cacheTags'

const REPO = 'cici'

/** Branch the public client reads from (matches the raw base URL below). */
const BRANCH = 'main'

const getFirstImageURLFrom = (content: string): string | null => {
  const imgRegex = /(https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|gif|webp))/i
  const match = imgRegex.exec(content)
  if (match) {
    const url = match[1]
    return url.startsWith('https://github') ? `${url}?raw=true` : url
  }
  return null
}

/**
 * Public GitHub client that uses raw.githubusercontent.com URLs
 * to avoid API rate limits for public content access
 */
export class PublicGitHubClient {
  private baseUrl: string
  private owner: string
  private repo: string

  constructor(owner: string, repo: string = REPO) {
    this.owner = owner
    this.repo = repo
    this.baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${BRANCH}`
  }

  /**
   * List the `.md` filenames in the blog directory via the GitHub Contents API.
   *
   * raw.githubusercontent.com can serve a file by path but cannot list a
   * directory, so enumerating posts requires one API call. It runs
   * unauthenticated (60 req/hr per IP), so the result is cached in the Next
   * Data Cache (`revalidate`, tag `blog-index`) — one upstream call per window
   * regardless of traffic — and invalidated on owner writes via
   * `revalidateTag(BLOG_INDEX_TAG)`. Post bodies are still read from raw URLs
   * (see `getBlogPost`), which do not count against the API budget.
   */
  private async listBlogFilenames(): Promise<string[]> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${contentPaths.blogDir()}?ref=${BRANCH}`
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      next: { revalidate: BLOG_INDEX_REVALIDATE, tags: [BLOG_INDEX_TAG] },
    })

    if (!response.ok) {
      // 404 = no blog dir yet; anything else (e.g. 403 rate limit) degrades to
      // an empty list rather than throwing. The Data Cache serves the last good
      // listing while a failed revalidation is retried.
      if (response.status !== 404) {
        console.warn(`Blog directory listing failed: HTTP ${response.status} ${response.statusText}`)
      }
      return []
    }

    const entries = await response.json()
    if (!Array.isArray(entries)) return []
    return entries
      .filter(
        (e) => e && e.type === 'file' && typeof e.name === 'string' && e.name.endsWith('.md') && e.name !== '.gitkeep'
      )
      .map((e) => e.name as string)
  }

  /**
   * Fetch all blog posts: enumerate the directory live, then read each body
   * from raw URLs. No manifest — a post is listed the instant its `.md` lands,
   * however it was added (editor or a direct git commit).
   */
  async getBlogPosts(includeAuthenticatedDrafts = false): Promise<BlogPost[]> {
    try {
      const filenames = await this.listBlogFilenames()
      const posts = await Promise.all(filenames.map((filename) => this.getBlogPost(filename)))
      const validPosts = posts.filter((post): post is BlogPost => post !== null)

      if (includeAuthenticatedDrafts) {
        return validPosts
      }
      return validPosts.filter((post) => post.status === 'published')
    } catch (error) {
      console.error('Error fetching blog posts via raw URLs:', error)
      throw error
    }
  }

  /**
   * Fetch a single blog post using raw GitHub URLs
   */
  async getBlogPost(filename: string): Promise<BlogPost | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${contentPaths.blogFile(filename)}`, {
        next: { revalidate: BLOG_INDEX_REVALIDATE, tags: [BLOG_INDEX_TAG] },
      })

      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const content = await response.text()
      const metadata = parseBlogPostMetadata(content)

      return {
        id: filename.replace('.md', ''),
        title: metadata.title
          ? decodeURIComponent(metadata.title.trim())
          : decodeURIComponent(filename.replace('.md', '')),
        content,
        imageUrl: getFirstImageURLFrom(content),
        date: metadata.date ? new Date(metadata.date.trim()).toISOString() : new Date().toISOString(),
        discussions: metadata.discussions.length > 0 ? metadata.discussions : undefined,
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        city: metadata.city,
        street: metadata.street,
        status: metadata.status || 'published',
        publishedAt: metadata.publishedAt || metadata.date,
        lastModified: metadata.lastModified || metadata.date || new Date().toISOString()
      }
    } catch (error) {
      console.error(`Error fetching blog post ${filename}:`, error)
      return null
    }
  }

  /**
   * Fetch memos using raw GitHub URLs (no API limits)
   */
  async getMemos(): Promise<Memo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/${contentPaths.memos()}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('memos.json not found, returning empty array')
          return []
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const memos = await response.json()
      return Array.isArray(memos) ? memos : []
    } catch (error) {
      console.error('Error fetching memos via raw URLs:', error)
      return []
    }
  }

  /**
   * Fetch links using raw GitHub URLs
   */
  async getLinks(): Promise<Record<string, string>> {
    try {
      const response = await fetch(`${this.baseUrl}/${contentPaths.siteConfig()}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          return {}
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const config = await response.json()
      return config.links || {}
    } catch (error) {
      console.warn('Error fetching links via raw URLs:', error)
      return {}
    }
  }

  /**
   * Fetch likes using raw GitHub URLs (no API limits)
   */
  async getLikes(): Promise<LikesDatabase> {
    try {
      const response = await fetch(`${this.baseUrl}/${contentPaths.likes()}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('likes.json not found, returning empty object')
          return {}
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const likes = await response.json()
      return typeof likes === 'object' && likes !== null ? likes : {}
    } catch (error) {
      console.error('Error fetching likes via raw URLs:', error)
      return {}
    }
  }

  /**
   * Get all draft posts (requires authentication context)
   */
  async getDrafts(): Promise<BlogPost[]> {
    const allPosts = await this.getBlogPosts(true)
    return allPosts.filter(post => post.status === 'draft')
  }

  /**
   * Get all blog posts (both published and drafts)
   */
  async getAllBlogPosts(): Promise<BlogPost[]> {
    return this.getBlogPosts(true)
  }

  /**
   * Check if the repository and basic structure exists
   */
  async checkRepositoryHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/README.md`)
      return response.ok
    } catch {
      return false
    }
  }
}

/**
 * Create a public GitHub client instance
 */
export const createPublicGitHubClient = (owner: string) => new PublicGitHubClient(owner)

/**
 * Fallback client that tries public raw URLs first, then falls back to API
 */
export class HybridGitHubClient {
  private publicClient: PublicGitHubClient
  private apiClient: ReturnType<typeof createGitHubAPIClient> | null = null

  constructor(owner: string, accessToken?: string) {
    this.publicClient = new PublicGitHubClient(owner)
    if (accessToken) {
      // Use the existing API client as fallback
      this.apiClient = createGitHubAPIClient(accessToken)
    }
  }

  async getBlogPosts(): Promise<BlogPost[]> {
    // For authenticated users, try API first (fresh data) then fallback to raw URLs
    if (this.apiClient) {
      try {
        return await this.apiClient.getBlogPosts()
      } catch (error) {
        console.warn('API client failed, falling back to raw URLs:', error)
        return await this.publicClient.getBlogPosts()
      }
    }
    
    // For unauthenticated users, use raw URLs only (no rate limits)
    return await this.publicClient.getBlogPosts()
  }

  async getBlogPost(filename: string): Promise<BlogPost | null> {
    try {
      return await this.publicClient.getBlogPost(filename)
    } catch (error) {
      console.warn('Public client failed for blog post, falling back to API:', error)
      if (this.apiClient) {
        return (await this.apiClient.getBlogPost(filename)) || null
      }
      throw error
    }
  }

  async getMemos(): Promise<Memo[]> {
    try {
      return await this.publicClient.getMemos()
    } catch (error) {
      console.warn('Public client failed for memos, falling back to API:', error)
      if (this.apiClient) {
        return await this.apiClient.getMemos()
      }
      throw error
    }
  }

  async getLinks(): Promise<Record<string, string>> {
    try {
      return await this.publicClient.getLinks()
    } catch (error) {
      console.warn('Public client failed for links, falling back to API:', error)
      if (this.apiClient) {
        return await this.apiClient.getLinks()
      }
      throw error
    }
  }

  async getLikes(): Promise<LikesDatabase> {
    try {
      return await this.publicClient.getLikes()
    } catch (error) {
      console.warn('Public client failed for likes, falling back to API:', error)
      if (this.apiClient) {
        return await this.apiClient.getLikes()
      }
      throw error
    }
  }
}

export const createHybridGitHubClient = (owner: string, accessToken?: string) => 
  new HybridGitHubClient(owner, accessToken)