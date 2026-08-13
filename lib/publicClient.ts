import { BlogPost, Memo } from './types'
import { createGitHubAPIClient } from './client'
import { LikesDatabase } from './likeUtils'
import { parseBlogPostMetadata } from './markdown'
import { extractTitleFromContent } from './titleUtils'

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

/**
 * Public GitHub client that uses raw.githubusercontent.com URLs
 * to avoid API rate limits for public content access
 */
export class PublicGitHubClient {
  private baseUrl: string
  private owner: string

  constructor(owner: string, repo: string = REPO) {
    this.owner = owner
    this.baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main`
  }

  /**
   * Fetch blog posts using raw GitHub URLs (no API limits)
   * Note: PublicClient cannot list directories, so this requires a manifest file
   */
  async getBlogPosts(includeAuthenticatedDrafts = false): Promise<BlogPost[]> {
    try {
      // Try to fetch a blog manifest file if it exists
      try {
        const manifestResponse = await fetch(`${this.baseUrl}/data/blog-manifest.json`)
        if (manifestResponse.ok) {
          const manifest = await manifestResponse.json()
          // Handle both legacy and new manifest formats
          const files = manifest.files || [...(manifest.published || []), ...(manifest.drafts || [])]
          const posts = await Promise.all(
            files.map((filename: string) => this.getBlogPost(filename))
          )
          const validPosts = posts.filter((post): post is BlogPost => post !== null)
          
          // Filter based on authentication
          if (includeAuthenticatedDrafts) {
            return validPosts
          } else {
            return validPosts.filter(post => post.status === 'published')
          }
        }
      } catch {
        // Manifest doesn't exist, continue to fallback
      }

      // If manifest doesn't exist, return empty array
      console.warn('Blog manifest not found, returning empty array')
      return []
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
      const response = await fetch(`${this.baseUrl}/data/blog/${filename}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const content = await response.text()
      const metadata = parseBlogPostMetadata(content)

      // Extract title from H1 in content, fallback to frontmatter title
      const extractedTitle = extractTitleFromContent(content)
      const frontmatterTitle = metadata.title
        ? decodeURIComponent(metadata.title.trim())
        : decodeURIComponent(filename.replace('.md', ''))
      const finalTitle = extractedTitle || frontmatterTitle

      return {
        id: filename.replace('.md', ''),
        title: finalTitle,
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
      const response = await fetch(`${this.baseUrl}/data/memos.json`)
      
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
      const response = await fetch(`${this.baseUrl}/data/site-config.json`)
      
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
      const response = await fetch(`${this.baseUrl}/data/likes.json`)
      
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