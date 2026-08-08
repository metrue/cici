/**
 * @jest-environment node
 *
 * ContentProvider contract, exercised against LocalProvider (temp dir).
 */
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'

describe('LocalProvider (ContentProvider contract)', () => {
  let tmpDir: string
  const saved = process.env.CICI_DIR

  async function provider() {
    jest.resetModules()
    process.env.CICI_DIR = tmpDir
    const { LocalProvider } = await import('@/lib/runtime/localProvider')
    return new LocalProvider(tmpDir)
  }

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cici-lp-'))
    process.env.CICI_DIR = tmpDir
    await fsp.mkdir(path.join(tmpDir, 'blog'), { recursive: true })
    await fsp.writeFile(path.join(tmpDir, 'memos.json'), '[]', 'utf-8')
    await fsp.writeFile(
      path.join(tmpDir, 'cici.json'),
      JSON.stringify({ title: 'My Blog', description: 'd', author: { name: 'me', bio: '', location: '' }, keywords: [], social: { github: '', twitter: '' } }),
      'utf-8'
    )
  })

  afterEach(async () => {
    if (saved === undefined) delete process.env.CICI_DIR
    else process.env.CICI_DIR = saved
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('canWrite() is true and label names the dir', async () => {
    const p = await provider()
    expect(p.canWrite()).toBe(true)
    expect(p.label).toContain(tmpDir)
  })

  it('create → read → update → delete a blog post', async () => {
    const p = await provider()
    const slug = await p.createBlogPost({ title: 'Round Trip', content: 'v1' })
    expect(slug).toBe('round-trip')

    let post = await p.getBlogPost('round-trip')
    expect(post?.title).toBe('Round Trip')
    expect(post?.content).toContain('v1')

    await p.updateBlogPost('round-trip', { title: 'Round Trip', content: 'v2' })
    post = await p.getBlogPost('round-trip')
    expect(post?.content).toContain('v2')

    await p.deleteBlogPost('round-trip')
    expect(await p.getBlogPost('round-trip')).toBeUndefined()
  })

  it('getBlogPosts filters drafts unless includeDrafts', async () => {
    const p = await provider()
    await p.createBlogPost({ title: 'Pub', content: 'x', status: 'published' })
    await p.createBlogPost({ title: 'Draft One', content: 'y', status: 'draft' })
    expect((await p.getBlogPosts()).map((b) => b.id).sort()).toEqual(['pub'])
    expect((await p.getBlogPosts({ includeDrafts: true })).length).toBe(2)
  })

  it('memo create/update/delete', async () => {
    const p = await provider()
    await p.createMemo({ id: 'm1', content: 'hi', timestamp: '2020-01-01T00:00:00Z' })
    expect((await p.getMemos()).length).toBe(1)
    const updated = await p.updateMemo('m1', 'edited')
    expect(updated.content).toBe('edited')
    await p.deleteMemo('m1')
    expect(await p.getMemos()).toEqual([])
  })

  it('getSiteConfig reads the on-disk config', async () => {
    const p = await provider()
    const cfg = await p.getSiteConfig()
    expect(cfg?.title).toBe('My Blog')
  })
})
