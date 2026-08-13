/**
 * @jest-environment node
 */

import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

import {
  GitHubHighlightsRepo,
  HighlightsWriteUnavailableError,
  LocalFsHighlightsRepo,
  OctokitLike,
  clearHighlightsCache,
} from '@/lib/highlights/highlightsRepo'
import { PostHighlights, emptyPostHighlights } from '@/lib/highlights/schema'

function makePostHighlights(postId: string): PostHighlights {
  return {
    postId,
    schemaVersion: 1,
    highlights: [
      {
        id: 'hl_1',
        anchor: {
          startOffset: 0,
          endOffset: 5,
          exact: 'Hello',
          prefix: '',
          suffix: ' world',
        },
        thread: [
          {
            id: 'cm_1',
            parentId: null,
            body: 'great point',
            authorName: null,
            fingerprint: 'fp_abc',
            country: 'NL',
            platform: 'web',
            reactions: {},
            resolved: false,
            createdAt: new Date('2026-05-28T10:00:00Z').toISOString(),
            hidden: false,
          },
        ],
        resolved: false,
        createdAt: new Date('2026-05-28T10:00:00Z').toISOString(),
      },
    ],
  }
}

describe('LocalFsHighlightsRepo', () => {
  let tmpDir: string
  let repo: LocalFsHighlightsRepo

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'highlights-test-'))
    repo = new LocalFsHighlightsRepo(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns empty PostHighlights when the file does not exist', async () => {
    const result = await repo.load('post-a')
    expect(result.data).toEqual(emptyPostHighlights('post-a'))
    expect(result.sha).toBeNull()
  })

  it('roundtrips a save → load', async () => {
    const data = makePostHighlights('post-a')
    await repo.save('post-a', data, null, 'add highlight')

    const result = await repo.load('post-a')
    expect(result.data).toEqual(data)
    expect(result.sha).toBeNull()

    const filePath = path.join(tmpDir, 'highlights', 'post-a.json')
    expect((await fs.stat(filePath)).isFile()).toBe(true)
  })

  it('rejects unsafe postIds (path traversal)', async () => {
    await expect(repo.load('../etc/passwd')).rejects.toThrow(/Invalid postId/)
    await expect(
      repo.save('../etc/passwd', makePostHighlights('a'), null, 'msg'),
    ).rejects.toThrow(/Invalid postId/)
  })

  it('rejects postIds containing slashes, null bytes, or leading dots', async () => {
    await expect(repo.load('foo/bar')).rejects.toThrow(/Invalid postId/)
    await expect(repo.load('foo\\bar')).rejects.toThrow(/Invalid postId/)
    await expect(repo.load('foo\x00bar')).rejects.toThrow(/Invalid postId/)
    await expect(repo.load('foo..bar')).rejects.toThrow(/Invalid postId/)
    await expect(repo.load('.hidden')).rejects.toThrow(/Invalid postId/)
    await expect(repo.load('')).rejects.toThrow(/Invalid postId/)
  })

  it('accepts CJK / full-width punctuation in postIds', async () => {
    // Real post IDs from blog.minghe.me's data/blog/ folder
    const okIds = [
      '我做了一款旅行记录应用：mile', // Chinese + full-width colon
      '四月的尾巴逛德国-柏林',
      '华为鸿蒙-harmaryos-next-线下活动小记',
      '逛逛济州岛',
      '2017-summary',
    ]
    for (const id of okIds) {
      // Should not throw — the file just doesn't exist yet
      const result = await repo.load(id)
      expect(result.data.postId).toBe(id)
      expect(result.sha).toBeNull()
    }
  })

  it('rejects malformed PostHighlights on save', async () => {
    const bad = { postId: 'post-a', schemaVersion: 1, highlights: 'not an array' }
    await expect(
      repo.save('post-a', bad as unknown as PostHighlights, null, 'msg'),
    ).rejects.toThrow()
  })

  it('rejects malformed JSON on load', async () => {
    const filePath = path.join(tmpDir, 'highlights', 'post-a.json')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, 'not json', 'utf-8')

    await expect(repo.load('post-a')).rejects.toThrow()
  })
})

describe('GitHubHighlightsRepo', () => {
  let octokit: jest.Mocked<OctokitLike['repos']> & { repos: jest.Mocked<OctokitLike['repos']> }
  let mockRepos: jest.Mocked<OctokitLike['repos']>
  let repo: GitHubHighlightsRepo

  beforeEach(() => {
    clearHighlightsCache()
    mockRepos = {
      getContent: jest.fn(),
      createOrUpdateFileContents: jest.fn(),
    } as unknown as jest.Mocked<OctokitLike['repos']>
    repo = new GitHubHighlightsRepo({ repos: mockRepos } as OctokitLike, 'test-owner')
  })

  function fileResponse(content: string, sha: string) {
    return {
      data: {
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(content, 'utf-8').toString('base64'),
        sha,
      },
    }
  }

  function notFoundError(): Error {
    const err = new Error('Not Found') as Error & { status: number }
    err.status = 404
    return err
  }

  function conflictError(): Error {
    const err = new Error('Conflict') as Error & { status: number }
    err.status = 409
    return err
  }

  describe('load', () => {
    it('returns empty PostHighlights on 404', async () => {
      mockRepos.getContent.mockRejectedValueOnce(notFoundError())

      const result = await repo.load('post-a')

      expect(result.data).toEqual(emptyPostHighlights('post-a'))
      expect(result.sha).toBeNull()
      expect(mockRepos.getContent).toHaveBeenCalledTimes(1)
    })

    it('parses and returns existing file with SHA', async () => {
      const data = makePostHighlights('post-a')
      mockRepos.getContent.mockResolvedValueOnce(fileResponse(JSON.stringify(data), 'sha-123'))

      const result = await repo.load('post-a')

      expect(result.data).toEqual(data)
      expect(result.sha).toBe('sha-123')
    })

    it('caches the load result for 30s (subsequent loads do not call octokit)', async () => {
      const data = makePostHighlights('post-a')
      mockRepos.getContent.mockResolvedValueOnce(fileResponse(JSON.stringify(data), 'sha-1'))

      await repo.load('post-a')
      await repo.load('post-a')

      expect(mockRepos.getContent).toHaveBeenCalledTimes(1)
    })

    it('rejects malformed JSON', async () => {
      mockRepos.getContent.mockResolvedValueOnce(fileResponse('not json', 'sha-x'))
      await expect(repo.load('post-a')).rejects.toThrow()
    })

    it('rejects on path-like postId', async () => {
      await expect(repo.load('../secrets')).rejects.toThrow(/Invalid postId/)
    })
  })

  describe('save', () => {
    it('creates a new file when expectedSha is null (no sha param sent)', async () => {
      mockRepos.createOrUpdateFileContents.mockResolvedValueOnce({
        data: { content: { sha: 'new-sha-1' } },
      })

      const data = makePostHighlights('post-a')
      const result = await repo.save('post-a', data, null, 'first highlight')

      expect(result.sha).toBe('new-sha-1')
      const callArgs = mockRepos.createOrUpdateFileContents.mock.calls[0][0]
      expect(callArgs).toMatchObject({
        owner: 'test-owner',
        repo: 'cici',
        path: 'data/highlights/post-a.json',
        message: 'first highlight',
      })
      expect(callArgs.sha).toBeUndefined()
    })

    it('updates an existing file with the provided sha', async () => {
      mockRepos.createOrUpdateFileContents.mockResolvedValueOnce({
        data: { content: { sha: 'sha-2' } },
      })

      const data = makePostHighlights('post-a')
      await repo.save('post-a', data, 'sha-1', 'add reply')

      expect(mockRepos.createOrUpdateFileContents.mock.calls[0][0]).toMatchObject({ sha: 'sha-1' })
    })

    it('retries with fresh SHA on 409 then succeeds', async () => {
      mockRepos.createOrUpdateFileContents
        .mockRejectedValueOnce(conflictError())
        .mockResolvedValueOnce({ data: { content: { sha: 'sha-final' } } })
      const data = makePostHighlights('post-a')
      mockRepos.getContent.mockResolvedValueOnce(
        fileResponse(JSON.stringify(data), 'sha-fresh'),
      )

      const result = await repo.save('post-a', data, 'sha-stale', 'commit')

      expect(result.sha).toBe('sha-final')
      expect(mockRepos.createOrUpdateFileContents).toHaveBeenCalledTimes(2)
      // Second call must use the freshly read SHA, not the stale one
      expect(mockRepos.createOrUpdateFileContents.mock.calls[1][0]).toMatchObject({ sha: 'sha-fresh' })
    })

    it('throws after 3 retries of persistent 409', async () => {
      mockRepos.createOrUpdateFileContents.mockRejectedValue(conflictError())
      mockRepos.getContent.mockResolvedValue(
        fileResponse(JSON.stringify(makePostHighlights('post-a')), 'sha-x'),
      )

      const data = makePostHighlights('post-a')
      await expect(repo.save('post-a', data, 'sha-y', 'commit')).rejects.toThrow(
        /retries due to write contention/,
      )
      expect(mockRepos.createOrUpdateFileContents).toHaveBeenCalledTimes(3)
    })

    it('invalidates cache on successful save (next load re-fetches)', async () => {
      const data = makePostHighlights('post-a')
      // First load → populates cache
      mockRepos.getContent.mockResolvedValueOnce(fileResponse(JSON.stringify(data), 'sha-1'))
      await repo.load('post-a')
      // Save → invalidates / overwrites cache with new sha
      mockRepos.createOrUpdateFileContents.mockResolvedValueOnce({
        data: { content: { sha: 'sha-2' } },
      })
      await repo.save('post-a', data, 'sha-1', 'msg')
      // Subsequent load uses cache (sha-2), no octokit fetch
      const result = await repo.load('post-a')
      expect(result.sha).toBe('sha-2')
      expect(mockRepos.getContent).toHaveBeenCalledTimes(1) // only the first load
    })

    it('rejects malformed PostHighlights without calling octokit', async () => {
      const bad = { postId: 'post-a', schemaVersion: 1, highlights: 'nope' }
      await expect(
        repo.save('post-a', bad as unknown as PostHighlights, null, 'msg'),
      ).rejects.toThrow()
      expect(mockRepos.createOrUpdateFileContents).not.toHaveBeenCalled()
    })

    it('maps a 403 (token lacks contents:write) to HighlightsWriteUnavailableError, no retry', async () => {
      const forbidden = new Error('Resource not accessible by personal access token') as Error & { status: number }
      forbidden.status = 403
      mockRepos.createOrUpdateFileContents.mockRejectedValue(forbidden)
      await expect(
        repo.save('post-a', makePostHighlights('post-a'), null, 'msg'),
      ).rejects.toThrow(HighlightsWriteUnavailableError)
      // Permission errors aren't a write-contention retry — tried exactly once.
      expect(mockRepos.createOrUpdateFileContents).toHaveBeenCalledTimes(1)
    })
  })

  describe('read-only (no write token, public repo)', () => {
    let readOnlyRepo: GitHubHighlightsRepo

    beforeEach(() => {
      readOnlyRepo = new GitHubHighlightsRepo(
        { repos: mockRepos } as OctokitLike,
        'test-owner',
        'cici',
        true,
      )
    })

    it('still loads highlights (reads work unauthenticated)', async () => {
      const data = makePostHighlights('post-a')
      mockRepos.getContent.mockResolvedValueOnce(fileResponse(JSON.stringify(data), 'sha-ro'))

      const result = await readOnlyRepo.load('post-a')

      expect(result.data).toEqual(data)
      expect(result.sha).toBe('sha-ro')
    })

    it('throws on save without ever calling octokit', async () => {
      await expect(
        readOnlyRepo.save('post-a', makePostHighlights('post-a'), null, 'msg'),
      ).rejects.toThrow(HighlightsWriteUnavailableError)
      expect(mockRepos.createOrUpdateFileContents).not.toHaveBeenCalled()
    })
  })
})
