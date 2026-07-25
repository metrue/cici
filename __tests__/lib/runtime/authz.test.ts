/**
 * @jest-environment node
 */
import type { Session } from 'next-auth'

describe('isAuthorizedToWrite / isOwner', () => {
  const saved = { ...process.env }
  const ENV_KEYS = ['CICI_DIR', 'CICI_REPO', 'CICI_TOKEN', 'GITHUB_USERNAME', 'GITHUB_ID', 'NODE_ENV']

  async function load(env: Record<string, string | undefined>, session: Session | null) {
    jest.resetModules()
    for (const k of ENV_KEYS) delete process.env[k]
    Object.assign(process.env, env)
    jest.doMock('@/lib/auth', () => ({ getSession: jest.fn().mockResolvedValue(session) }))
    return import('@/lib/runtime/authz')
  }

  const session = (username: string): Session =>
    ({ user: { username }, accessToken: 'tok', expires: '2999-01-01' }) as unknown as Session

  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k]
    Object.assign(process.env, saved)
    jest.resetModules()
  })

  it('local mode → always authorized', async () => {
    const { isAuthorizedToWrite } = await load({ CICI_DIR: '/tmp/b' }, null)
    expect(await isAuthorizedToWrite()).toBe(true)
  })

  it('CLI mode (no OAuth) with CICI_TOKEN → authorized', async () => {
    const { isAuthorizedToWrite } = await load({ CICI_REPO: 'me/blog', CICI_TOKEN: 'ghp' }, null)
    expect(await isAuthorizedToWrite()).toBe(true)
  })

  it('CLI mode (no OAuth) without CICI_TOKEN → not authorized', async () => {
    const { isAuthorizedToWrite } = await load({ CICI_REPO: 'me/blog' }, null)
    expect(await isAuthorizedToWrite()).toBe(false)
  })

  it('hosted OAuth: owner session → authorized', async () => {
    const { isAuthorizedToWrite } = await load({ CICI_REPO: 'me/blog', GITHUB_ID: 'oauth' }, session('me'))
    expect(await isAuthorizedToWrite()).toBe(true)
  })

  it('hosted OAuth: non-owner session → not authorized', async () => {
    const { isAuthorizedToWrite } = await load({ CICI_REPO: 'me/blog', GITHUB_ID: 'oauth' }, session('intruder'))
    expect(await isAuthorizedToWrite()).toBe(false)
  })

  it('hosted OAuth: anonymous → not authorized', async () => {
    const { isAuthorizedToWrite } = await load({ CICI_REPO: 'me/blog', GITHUB_ID: 'oauth' }, null)
    expect(await isAuthorizedToWrite()).toBe(false)
  })

  it('hosted OAuth: stray CICI_TOKEN + anonymous → still not authorized (footgun closed)', async () => {
    const { isAuthorizedToWrite } = await load(
      { CICI_REPO: 'me/blog', GITHUB_ID: 'oauth', CICI_TOKEN: 'shared' },
      null,
    )
    expect(await isAuthorizedToWrite()).toBe(false)
  })

  it('owner derives from CICI_REPO even without GITHUB_USERNAME', async () => {
    const { isOwner } = await load({ CICI_REPO: 'alice/site', GITHUB_ID: 'oauth' }, session('alice'))
    expect(await isOwner()).toBe(true)
  })
})
