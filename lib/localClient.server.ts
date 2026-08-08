import fs from 'fs'
import path from 'path'
import type { BlogPost, Memo, ExternalDiscussion } from './types'
import type { SiteConfig } from './siteConfig'
import { LikesDatabase } from './likeUtils'
import { parseBlogPostMetadata } from './markdown'
import { contentRel } from './content/paths'
import { localDataDir } from './runtime/mode'
import {
  buildBlogMarkdown,
  slugFromTitle,
  extractDate,
  extractStatus,
  type BlogLocation,
} from './blogFrontmatter'

export interface BlogWriteInput {
  title: string
  content: string
  discussions?: ExternalDiscussion[]
  location?: BlogLocation
  status?: string
}

/**
 * Local file system client (server-side only).
 * Reads/writes content from the local content root — `<cwd>/data` in dev, or
 * the `--dir <dir>` directory in local mode. Paths are resolved relative to
 * that root via `contentRel` (which carries no `data/` prefix).
 */
export class LocalFileSystemClient {
  /** Resolve a content-root-relative path (from contentRel) to an absolute local path. */
  private abs(relPath: string): string {
    return path.join(localDataDir(), relPath)
  }

  private get dataDir() {
    return localDataDir()
  }

  private get blogDir() {
    return this.abs(contentRel.blogDir())
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

      return {
        id: filename.replace('.md', ''),
        title: metadata.title || filename.replace('.md', ''),
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
      const memosPath = this.abs(contentRel.memos())
      
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
   * Get the full site config — tries cici.json first, falls back to site-config.json.
   */
  async getSiteConfig(): Promise<SiteConfig | null> {
    try {
      const raw = this.readSiteConfigFile()
      if (!raw) return null
      return JSON.parse(raw) as SiteConfig
    } catch {
      return null
    }
  }

  /**
   * Try cici.json first, fall back to site-config.json (legacy).
   */
  private readSiteConfigFile(): string | null {
    for (const p of [contentRel.siteConfig(), contentRel.siteConfigLegacy()]) {
      try {
        const abs = this.abs(p)
        if (fs.existsSync(abs)) return fs.readFileSync(abs, 'utf-8')
      } catch { /* continue */ }
    }
    return null
  }

  /**
   * Get links from cici.json (or site-config.json as fallback).
   */
  async getLinks(): Promise<Record<string, string>> {
    try {
      const content = this.readSiteConfigFile()
      if (!content) return {}
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
      const likesPath = this.abs(contentRel.likes())
      
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
      const likesPath = this.abs(contentRel.likes())
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
      
      const memosPath = this.abs(contentRel.memos())
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
   * Create a new blog post on disk. Returns the slug id.
   */
  async createBlogPost(input: BlogWriteInput): Promise<string> {
    const slug = slugFromTitle(input.title)
    const filePath = this.abs(contentRel.blogFile(`${slug}.md`))
    const markdown = buildBlogMarkdown({
      title: input.title,
      date: new Date().toISOString(),
      content: input.content,
      status: input.status,
      location: input.location,
      discussions: input.discussions,
    })
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, markdown, 'utf-8')
    return slug
  }

  /**
   * Update an existing blog post on disk, preserving its original date and
   * (unless overridden) its status.
   */
  async updateBlogPost(id: string, input: BlogWriteInput): Promise<string> {
    const filePath = this.abs(contentRel.blogPost(id))
    let existing = ''
    try {
      existing = fs.readFileSync(filePath, 'utf-8')
    } catch {
      // No existing file — treat like a create at this id.
    }
    const date = extractDate(existing) ?? new Date().toISOString()
    const status = input.status !== undefined ? input.status : (extractStatus(existing) ?? 'published')
    const markdown = buildBlogMarkdown({
      title: input.title,
      date,
      content: input.content,
      status,
      location: input.location,
      discussions: input.discussions,
    })
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, markdown, 'utf-8')
    return id
  }

  /**
   * Delete a blog post from disk. No-op if it doesn't exist.
   */
  async deleteBlogPost(id: string): Promise<void> {
    const filePath = this.abs(contentRel.blogPost(id))
    try {
      fs.unlinkSync(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    }
  }

  /**
   * Update a memo's content in local memos.json (timestamp preserved).
   */
  async updateMemo(id: string, content: string): Promise<Memo> {
    const memos = await this.getMemos()
    const idx = memos.findIndex((m) => m.id === id)
    if (idx === -1) {
      throw new Error('Memo not found')
    }
    const updated: Memo = { ...memos[idx], content }
    const next = memos.map((m, i) => (i === idx ? updated : m))
    fs.writeFileSync(this.abs(contentRel.memos()), JSON.stringify(next, null, 2), 'utf-8')
    return updated
  }

  /**
   * Delete a memo from local memos.json.
   */
  async deleteMemo(id: string): Promise<void> {
    const memos = await this.getMemos()
    const next = memos.filter((m) => m.id !== id)
    fs.writeFileSync(this.abs(contentRel.memos()), JSON.stringify(next, null, 2), 'utf-8')
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