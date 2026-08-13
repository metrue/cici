import fs from 'fs'
import path from 'path'
import type { BlogPost, Memo } from './types'
import { LikesDatabase } from './likeUtils'
import { parseBlogPostMetadata } from './markdown'
import { extractTitleFromContent } from './titleUtils'

/**
 * Local file system client for development (server-side only)
 * Reads data from local data/ directory instead of GitHub
 */
export class LocalFileSystemClient {
  private get dataDir() {
    return path.join(process.cwd(), 'data')
  }

  private get blogDir() {
    return path.join(this.dataDir, 'blog')
  }
  /**
   * Get all blog posts from local data/blog directory
   */
  async getBlogPosts(includeAuthenticatedDrafts = false): Promise<BlogPost[]> {
    try {
      if (!fs.existsSync(this.blogDir)) {
        console.log('Blog directory does not exist, returning empty array')
        return []
      }

      const files = fs.readdirSync(this.blogDir)
      const blogFiles = files.filter(file => 
        file.endsWith('.md') && file !== '.gitkeep'
      )

      const posts: BlogPost[] = []
      
      for (const filename of blogFiles) {
        const post = await this.getBlogPost(filename)
        if (post) {
          posts.push(post)
        }
      }

      const validPosts = posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      
      // Filter based on authentication
      if (includeAuthenticatedDrafts) {
        return validPosts
      } else {
        return validPosts.filter(post => post.status === 'published')
      }
    } catch (error) {
      console.error('Error reading local blog posts:', error)
      return []
    }
  }

  /**
   * Get a single blog post from local file
   */
  async getBlogPost(filename: string): Promise<BlogPost | null> {
    try {
      const filePath = path.join(this.blogDir, filename)
      
      if (!fs.existsSync(filePath)) {
        return null
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const metadata = parseBlogPostMetadata(content)

      // Extract first image URL from content
      const imageUrl = this.getFirstImageURLFrom(content)

      // Extract title from H1 in content, fallback to frontmatter title
      const extractedTitle = extractTitleFromContent(content)
      const finalTitle = extractedTitle || metadata.title || filename.replace('.md', '')

      return {
        id: filename.replace('.md', ''),
        title: finalTitle,
        content,
        imageUrl,
        date: metadata.date ? new Date(metadata.date).toISOString() : new Date().toISOString(),
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
      console.error(`Error reading blog post ${filename}:`, error)
      return null
    }
  }

  /**
   * Get all memos from local data/memos.json
   */
  async getMemos(): Promise<Memo[]> {
    try {
      const memosPath = path.join(this.dataDir, 'memos.json')
      
      if (!fs.existsSync(memosPath)) {
        console.log('memos.json not found, returning empty array')
        return []
      }

      const content = fs.readFileSync(memosPath, 'utf-8')
      const memos = JSON.parse(content)
      
      return Array.isArray(memos) ? memos : []
    } catch (error) {
      console.error('Error reading local memos:', error)
      return []
    }
  }

  /**
   * Get links from local data/site-config.json
   */
  async getLinks(): Promise<Record<string, string>> {
    try {
      const configPath = path.join(this.dataDir, 'site-config.json')
      
      if (!fs.existsSync(configPath)) {
        return {}
      }

      const content = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      
      return config.links || {}
    } catch (error) {
      console.warn('Error reading local site config:', error)
      return {}
    }
  }

  /**
   * Get likes from local data/likes.json
   */
  async getLikes(): Promise<LikesDatabase> {
    try {
      const likesPath = path.join(this.dataDir, 'likes.json')
      
      if (!fs.existsSync(likesPath)) {
        console.log('likes.json not found, returning empty object')
        return {}
      }

      const content = fs.readFileSync(likesPath, 'utf-8')
      const likes = JSON.parse(content)
      
      return typeof likes === 'object' && likes !== null ? likes : {}
    } catch (error) {
      console.error('Error reading local likes:', error)
      return {}
    }
  }

  /**
   * Update likes in local data/likes.json (for development)
   */
  async updateLikes(likesData: LikesDatabase): Promise<void> {
    try {
      const likesPath = path.join(this.dataDir, 'likes.json')
      const content = JSON.stringify(likesData, null, 2)
      fs.writeFileSync(likesPath, content, 'utf-8')
      console.log('Updated local likes data')
    } catch (error) {
      console.error('Error updating local likes:', error)
      throw new Error('Failed to update local likes data')
    }
  }

  /**
   * Create a new memo in local data/memos.json (for development)
   */
  async createMemo(memo: Memo): Promise<Memo> {
    try {
      const memos = await this.getMemos()
      const updatedMemos = [memo, ...memos]
      
      const memosPath = path.join(this.dataDir, 'memos.json')
      const content = JSON.stringify(updatedMemos, null, 2)
      fs.writeFileSync(memosPath, content, 'utf-8')
      
      console.log('Created new memo locally')
      return memo
    } catch (error) {
      console.error('Error creating local memo:', error)
      throw new Error('Failed to create memo locally')
    }
  }

  /**
   * Get all draft posts
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
   * Check if local data directory exists
   */
  async checkRepositoryHealth(): Promise<boolean> {
    return fs.existsSync(this.dataDir)
  }

  /**
   * Extract first image URL from markdown content
   */
  private getFirstImageURLFrom(content: string): string | null {
    const imgRegex = /(https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|gif|webp))/i
    const match = imgRegex.exec(content)
    if (match) {
      const url = match[1]
      return url.startsWith('https://github') ? `${url}?raw=true` : url
    }
    return null
  }
}

/**
 * Create a local file system client instance (server-side only)
 */
export const createLocalFileSystemClient = () => new LocalFileSystemClient()