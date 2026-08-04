import type { ExternalDiscussion } from './types'

export interface BlogPostMetadata {
  title: string
  date: string
  discussions: ExternalDiscussion[]
  latitude?: number
  longitude?: number
  city?: string
  street?: string
  status?: 'draft' | 'published'
  publishedAt?: string
  lastModified?: string
}

/**
 * Extract frontmatter from markdown content
 */
export function extractFrontmatter(content: string): { frontmatter: string; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!frontmatterMatch) {
    return { frontmatter: '', body: content }
  }
  return {
    frontmatter: frontmatterMatch[1],
    body: frontmatterMatch[2].replace(/^\n/, '') // Remove leading newline from body
  }
}

/**
 * Parse external discussions from frontmatter YAML-style content
 */
export function parseExternalDiscussions(frontmatter: string): ExternalDiscussion[] {
  const discussions: ExternalDiscussion[] = []
  const discussionsMatch = frontmatter.match(/external_discussions:\s*\n([\s\S]*?)(?=\n\w|$)/)
  
  if (!discussionsMatch) {
    return discussions
  }

  const discussionsText = discussionsMatch[1]
  const discussionLines = discussionsText.split('\n').filter(line => line.trim())
  
  let currentDiscussion: Partial<ExternalDiscussion> = {}
  
  for (const line of discussionLines) {
    if (line.includes('platform:')) {
      // Save previous discussion if complete
      if (currentDiscussion.platform && currentDiscussion.url) {
        discussions.push(currentDiscussion as ExternalDiscussion)
      }
      // Start new discussion
      currentDiscussion = { 
        platform: line.split(':')[1].trim() as ExternalDiscussion['platform'] 
      }
    } else if (line.includes('url:')) {
      // Only add URL if we have a current platform context
      if (currentDiscussion.platform) {
        currentDiscussion.url = line.split('url:')[1].trim()
      }
    }
  }
  
  // Save final discussion if complete
  if (currentDiscussion.platform && currentDiscussion.url) {
    discussions.push(currentDiscussion as ExternalDiscussion)
  }
  
  return discussions
}

/**
 * Parse blog post metadata from markdown content
 */
export function parseBlogPostMetadata(content: string): BlogPostMetadata {
  const { frontmatter } = extractFrontmatter(content)
  
  const titleMatch = frontmatter.match(/title:[ \t]*(.+)/)
  const dateMatch = frontmatter.match(/date:[ \t]*(.+)/)
  const latitudeMatch = frontmatter.match(/latitude:[ \t]*(.+)/)
  const longitudeMatch = frontmatter.match(/longitude:[ \t]*(.+)/)
  const cityMatch = frontmatter.match(/city:[ \t]*(.+)/)
  const streetMatch = frontmatter.match(/street:[ \t]*(.+)/)
  const statusMatch = frontmatter.match(/status:[ \t]*(.+)/)
  const publishedAtMatch = frontmatter.match(/publishedAt:[ \t]*(.+)/)
  const lastModifiedMatch = frontmatter.match(/lastModified:[ \t]*(.+)/)
  
  const latitudeStr = latitudeMatch?.[1]?.trim()
  const longitudeStr = longitudeMatch?.[1]?.trim()
  const latitudeNum = latitudeStr ? parseFloat(latitudeStr) : NaN
  const longitudeNum = longitudeStr ? parseFloat(longitudeStr) : NaN

  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    date: dateMatch ? dateMatch[1].trim() : new Date().toISOString(),
    discussions: parseExternalDiscussions(frontmatter),
    ...(latitudeStr && !isNaN(latitudeNum) && { latitude: latitudeNum }),
    ...(longitudeStr && !isNaN(longitudeNum) && { longitude: longitudeNum }),
    ...(cityMatch && cityMatch[1].trim() && { city: cityMatch[1].trim() }),
    ...(streetMatch && streetMatch[1].trim() && { street: streetMatch[1].trim() }),
    ...(statusMatch && { status: statusMatch[1].trim() as 'draft' | 'published' }),
    ...(publishedAtMatch && { publishedAt: publishedAtMatch[1].trim() }),
    ...(lastModifiedMatch && { lastModified: lastModifiedMatch[1].trim() })
  }
}

/**
 * Remove frontmatter from markdown content, leaving only the body
 */
export function removeFrontmatter(content: string): string {
  const { body } = extractFrontmatter(content)
  return body
}

/**
 * Best-effort `decodeURIComponent` — some stored content is percent-encoded,
 * some isn't. Returns the input unchanged if it isn't valid encoded text.
 */
export function decodeBlogContent(content: string): string {
  try {
    return decodeURIComponent(content)
  } catch {
    return content
  }
}

/**
 * Normalize raw stored blog content into a renderable body: decode, then strip
 * frontmatter. This is the single normalization used by BOTH the server (to
 * probe image dimensions) and the client (to render), so the image `src`
 * strings they each see are identical.
 */
export function normalizeBlogContent(raw: string): string {
  return removeFrontmatter(decodeBlogContent(raw))
}

/** A single image within a gallery segment. */
export interface GalleryImage {
  src: string
  alt: string
}

/**
 * A gallery image enriched with server-resolved dimensions, ready for
 * `react-photo-album`.
 */
export interface GalleryImageWithSize extends GalleryImage {
  width: number
  height: number
}

/** A run of markdown text between galleries. */
export type MarkdownSegment = { type: 'markdown'; content: string }

/**
 * A content segment: either a run of markdown, or a group of images to render
 * as an in-place photo gallery. Segments preserve document order.
 */
export type ContentSegment = MarkdownSegment | { type: 'gallery'; images: GalleryImage[] }

/** Same as ContentSegment, but gallery images carry resolved dimensions. */
export type EnrichedContentSegment = MarkdownSegment | { type: 'gallery'; images: GalleryImageWithSize[] }

// A line that is nothing but a single markdown image, e.g. `![alt](url "title")`.
const IMAGE_ONLY_LINE = /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)$/
// A fenced code-block delimiter (``` or ~~~), so images inside code are ignored.
const CODE_FENCE = /^\s*(```|~~~)/

function matchImageLine(line: string): GalleryImage | null {
  const m = line.trim().match(IMAGE_ONLY_LINE)
  if (!m) return null
  return { src: m[2], alt: m[1] }
}

/**
 * Split a normalized markdown body into ordered segments. Consecutive
 * image-only lines — even when separated by blank lines — coalesce into a
 * single gallery segment; a lone image becomes a one-image gallery. Any other
 * content (including inline images inside a paragraph, and images inside code
 * fences) stays in markdown segments untouched.
 */
export function parseContentSegments(body: string): ContentSegment[] {
  const lines = body.split('\n')
  const segments: ContentSegment[] = []
  let markdownLines: string[] = []
  let galleryImages: GalleryImage[] = []
  let inFence = false

  const flushMarkdown = (): void => {
    if (markdownLines.length === 0) return
    const content = markdownLines.join('\n').trim()
    if (content) segments.push({ type: 'markdown', content })
    markdownLines = []
  }

  const flushGallery = (): void => {
    if (galleryImages.length === 0) return
    segments.push({ type: 'gallery', images: galleryImages })
    galleryImages = []
  }

  for (const line of lines) {
    const isFence = CODE_FENCE.test(line)
    if (isFence) inFence = !inFence

    const image = !inFence && !isFence ? matchImageLine(line) : null

    if (image) {
      // Start or continue a gallery run. Any pending markdown closes first.
      flushMarkdown()
      galleryImages.push(image)
      continue
    }

    if (galleryImages.length > 0) {
      // Mid-gallery: a blank line only separates images, so absorb it and wait
      // for the next line to decide whether the run continues.
      if (line.trim() === '') continue
      // A non-blank, non-image line ends the gallery run.
      flushGallery()
    }

    markdownLines.push(line)
  }

  flushGallery()
  flushMarkdown()
  return segments
}

/**
 * Merge server-resolved dimensions into gallery segments, producing segments
 * ready for `react-photo-album`. `dimensions` must contain every gallery image
 * src (the dimension resolver guarantees this and owns the fallback), so no
 * fallback is applied here.
 */
export function enrichSegmentsWithDimensions(
  segments: ContentSegment[],
  dimensions: Record<string, { width: number; height: number }>
): EnrichedContentSegment[] {
  return segments.map((segment) =>
    segment.type === 'gallery'
      ? {
          type: 'gallery',
          images: segment.images.map((image) => ({
            ...image,
            width: dimensions[image.src].width,
            height: dimensions[image.src].height,
          })),
        }
      : segment
  )
}