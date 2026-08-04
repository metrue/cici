import {
  extractFrontmatter,
  parseExternalDiscussions,
  parseBlogPostMetadata,
  removeFrontmatter,
  decodeBlogContent,
  normalizeBlogContent,
  parseContentSegments
} from '../../lib/markdown'

describe('markdown parsing utilities', () => {
  describe('extractFrontmatter', () => {
    it('should extract frontmatter and body from markdown content', () => {
      const content = `---
title: Test Post
date: 2025-01-01
---

# Hello World

This is the content.`

      const result = extractFrontmatter(content)
      
      expect(result.frontmatter).toBe(`title: Test Post
date: 2025-01-01`)
      expect(result.body).toBe(`# Hello World

This is the content.`)
    })

    it('should return empty frontmatter when none exists', () => {
      const content = `# Hello World

This is the content.`

      const result = extractFrontmatter(content)
      
      expect(result.frontmatter).toBe('')
      expect(result.body).toBe(content)
    })
  })

  describe('parseExternalDiscussions', () => {
    it('should parse single external discussion', () => {
      const frontmatter = `title: Test Post
external_discussions:
  - platform: v2ex
    url: https://v2ex.com/t/123456
date: 2025-01-01`

      const result = parseExternalDiscussions(frontmatter)
      
      expect(result).toEqual([
        {
          platform: 'v2ex',
          url: 'https://v2ex.com/t/123456'
        }
      ])
    })

    it('should parse multiple external discussions', () => {
      const frontmatter = `title: Test Post
external_discussions:
  - platform: v2ex
    url: https://v2ex.com/t/123456
  - platform: reddit
    url: https://reddit.com/r/test/comments/abc123
  - platform: hackernews
    url: https://news.ycombinator.com/item?id=789
date: 2025-01-01`

      const result = parseExternalDiscussions(frontmatter)
      
      expect(result).toEqual([
        {
          platform: 'v2ex',
          url: 'https://v2ex.com/t/123456'
        },
        {
          platform: 'reddit', 
          url: 'https://reddit.com/r/test/comments/abc123'
        },
        {
          platform: 'hackernews',
          url: 'https://news.ycombinator.com/item?id=789'
        }
      ])
    })

    it('should return empty array when no external discussions', () => {
      const frontmatter = `title: Test Post
date: 2025-01-01`

      const result = parseExternalDiscussions(frontmatter)
      
      expect(result).toEqual([])
    })

    it('should ignore incomplete external discussions', () => {
      const frontmatter = `title: Test Post
external_discussions:
  - platform: v2ex
  - platform: reddit
    url: https://reddit.com/r/test/comments/abc123
  - platform: hackernews
    url: https://news.ycombinator.com/item?id=789
date: 2025-01-01`

      const result = parseExternalDiscussions(frontmatter)
      
      expect(result).toEqual([
        {
          platform: 'reddit',
          url: 'https://reddit.com/r/test/comments/abc123'
        },
        {
          platform: 'hackernews',
          url: 'https://news.ycombinator.com/item?id=789'
        }
      ])
    })
  })

  describe('parseBlogPostMetadata', () => {
    it('should parse complete blog post metadata', () => {
      const content = `---
title: My Amazing Post
date: 2025-08-14T19:34:28.147Z
external_discussions:
  - platform: v2ex
    url: https://v2ex.com/t/1158986
---

# Hello World

This is the content.`

      const result = parseBlogPostMetadata(content)
      
      expect(result).toEqual({
        title: 'My Amazing Post',
        date: '2025-08-14T19:34:28.147Z',
        discussions: [
          {
            platform: 'v2ex',
            url: 'https://v2ex.com/t/1158986'
          }
        ]
      })
    })

    it('should provide defaults for missing fields', () => {
      const content = `---
title: My Post
---

Content here.`

      const result = parseBlogPostMetadata(content)
      
      expect(result.title).toBe('My Post')
      expect(result.date).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/) // ISO date format
      expect(result.discussions).toEqual([])
    })
  })

  describe('removeFrontmatter', () => {
    it('should remove frontmatter and return only body', () => {
      const content = `---
title: Test Post
date: 2025-01-01
external_discussions:
  - platform: v2ex
    url: https://v2ex.com/t/123456
---

# Hello World

This is the content.`

      const result = removeFrontmatter(content)
      
      expect(result).toBe(`# Hello World

This is the content.`)
    })

    it('should return original content when no frontmatter', () => {
      const content = `# Hello World

This is the content.`

      const result = removeFrontmatter(content)

      expect(result).toBe(content)
    })
  })

  describe('decodeBlogContent', () => {
    it('decodes percent-encoded content', () => {
      expect(decodeBlogContent('a%20b')).toBe('a b')
    })

    it('returns the input unchanged when it is not valid encoded text', () => {
      expect(decodeBlogContent('100% done')).toBe('100% done')
    })
  })

  describe('normalizeBlogContent', () => {
    it('decodes then strips frontmatter so srcs match what the client renders', () => {
      const raw = `---\ntitle: T\n---\n\nHello ![a](%2Fapi%2Fasset%2Fimages%2Fx.png)`
      expect(normalizeBlogContent(raw)).toBe('Hello ![a](/api/asset/images/x.png)')
    })
  })

  describe('parseContentSegments', () => {
    it('returns a single markdown segment when there are no images', () => {
      const segments = parseContentSegments('# Title\n\nJust text.')
      expect(segments).toEqual([{ type: 'markdown', content: '# Title\n\nJust text.' }])
    })

    it('turns a lone image between paragraphs into a one-image gallery', () => {
      const segments = parseContentSegments('Before.\n\n![a](a.jpg)\n\nAfter.')
      expect(segments).toEqual([
        { type: 'markdown', content: 'Before.' },
        { type: 'gallery', images: [{ src: 'a.jpg', alt: 'a' }] },
        { type: 'markdown', content: 'After.' },
      ])
    })

    it('coalesces adjacent image lines into one gallery', () => {
      const segments = parseContentSegments('![a](a.jpg)\n![b](b.jpg)')
      expect(segments).toEqual([
        {
          type: 'gallery',
          images: [
            { src: 'a.jpg', alt: 'a' },
            { src: 'b.jpg', alt: 'b' },
          ],
        },
      ])
    })

    it('coalesces images separated only by blank lines (blank-line-tolerant)', () => {
      const segments = parseContentSegments('![a](a.jpg)\n\n![b](b.jpg)')
      expect(segments).toEqual([
        {
          type: 'gallery',
          images: [
            { src: 'a.jpg', alt: 'a' },
            { src: 'b.jpg', alt: 'b' },
          ],
        },
      ])
    })

    it('starts a new gallery after intervening text', () => {
      const body = 'p1\n\n![a](a.jpg)\n![b](b.jpg)\n\nmiddle\n\n![c](c.jpg)'
      const segments = parseContentSegments(body)
      expect(segments).toEqual([
        { type: 'markdown', content: 'p1' },
        { type: 'gallery', images: [{ src: 'a.jpg', alt: 'a' }, { src: 'b.jpg', alt: 'b' }] },
        { type: 'markdown', content: 'middle' },
        { type: 'gallery', images: [{ src: 'c.jpg', alt: 'c' }] },
      ])
    })

    it('leaves inline images inside a paragraph in the markdown segment', () => {
      const segments = parseContentSegments('Text with ![inline](x.png) inside.')
      expect(segments).toEqual([
        { type: 'markdown', content: 'Text with ![inline](x.png) inside.' },
      ])
    })

    it('does not gallerify images inside fenced code blocks', () => {
      const body = '```md\n![not a gallery](x.png)\n```'
      const segments = parseContentSegments(body)
      expect(segments).toEqual([{ type: 'markdown', content: body }])
    })

    it('parses the image title and keeps only the src', () => {
      const segments = parseContentSegments('![alt](/api/asset/images/x.png "a title")')
      expect(segments).toEqual([
        { type: 'gallery', images: [{ src: '/api/asset/images/x.png', alt: 'alt' }] },
      ])
    })
  })
})