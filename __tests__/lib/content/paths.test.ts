import { CONTENT_ROOT, contentPaths, contentRel } from '@/lib/content/paths'

describe('contentPaths registry', () => {
  it('roots everything under CONTENT_ROOT', () => {
    expect(CONTENT_ROOT).toBe('data')
    for (const build of Object.values(contentPaths)) {
      expect((build as (a?: string) => string)('x')).toMatch(/^data(\/|$)/)
    }
  })

  it('returns the canonical repo-relative paths', () => {
    expect(contentPaths.root()).toBe('data')
    expect(contentPaths.rootKeep()).toBe('data/.gitkeep')
    expect(contentPaths.blogDir()).toBe('data/blog')
    expect(contentPaths.blogDirKeep()).toBe('data/blog/.gitkeep')
    expect(contentPaths.memos()).toBe('data/memos.json')
    expect(contentPaths.likes()).toBe('data/likes.json')
    expect(contentPaths.siteConfig()).toBe('data/cici.json')
    expect(contentPaths.siteConfigLegacy()).toBe('data/site-config.json')
    expect(contentPaths.highlightsDir()).toBe('data/highlights')
  })

  it('builds a blog path from a bare slug (no .md) and appends exactly one .md', () => {
    expect(contentPaths.blogPost('hello-world')).toBe('data/blog/hello-world.md')
    // slug must not be double-suffixed by the helper
    expect(contentPaths.blogPost('hello-world')).not.toContain('.md.md')
  })

  it('builds a blog path from a filename that already has .md', () => {
    expect(contentPaths.blogFile('hello-world.md')).toBe('data/blog/hello-world.md')
  })

  it('builds a highlights file path from a slug', () => {
    expect(contentPaths.highlightsFile('hello-world')).toBe('data/highlights/hello-world.json')
  })

  it('produces no leading slash (safe to join or concat behind a base URL)', () => {
    expect(contentPaths.blogPost('x').startsWith('/')).toBe(false)
    expect(contentPaths.memos().startsWith('/')).toBe(false)
  })
})

describe('contentRel (content-root-relative) builders', () => {
  it('returns paths without the data/ prefix', () => {
    expect(contentRel.blogDir()).toBe('blog')
    expect(contentRel.blogPost('hello-world')).toBe('blog/hello-world.md')
    expect(contentRel.blogFile('hello-world.md')).toBe('blog/hello-world.md')
    expect(contentRel.memos()).toBe('memos.json')
    expect(contentRel.likes()).toBe('likes.json')
    expect(contentRel.siteConfig()).toBe('cici.json')
    expect(contentRel.siteConfigLegacy()).toBe('site-config.json')
    expect(contentRel.highlightsDir()).toBe('highlights')
    expect(contentRel.highlightsFile('hello-world')).toBe('highlights/hello-world.json')
  })

  it('none of the relative builders start with the content root', () => {
    for (const build of Object.values(contentRel)) {
      expect((build as (a?: string) => string)('x').startsWith(`${CONTENT_ROOT}/`)).toBe(false)
    }
  })

  it('contentPaths == CONTENT_ROOT + contentRel (composition holds)', () => {
    expect(contentPaths.blogPost('x')).toBe(`${CONTENT_ROOT}/${contentRel.blogPost('x')}`)
    expect(contentPaths.memos()).toBe(`${CONTENT_ROOT}/${contentRel.memos()}`)
    expect(contentPaths.highlightsFile('x')).toBe(`${CONTENT_ROOT}/${contentRel.highlightsFile('x')}`)
  })
})
