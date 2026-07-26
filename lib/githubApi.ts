import { Memo, ExternalDiscussion } from './types';
import { Octokit } from '@octokit/rest';
import { contentPaths } from './content/paths';
import { buildBlogMarkdown, slugFromTitle, extractDate, extractStatus } from './blogFrontmatter';
import path from 'path';
import {
  getOctokit,
  getRepoInfo,
  getFileContent,
  updateFileContents,
  ensureDirectoryExists,
  fileToBase64,
  isNotFoundError,
  createFileIfNotExists,
  type UpdateFileParams
} from './githubUtils';

const REPO = 'cici';

async function ensureRepoExists(octokit: Octokit, owner: string, repo: string) {
  try {
    const { data: repoData } = await octokit.repos.get({ owner, repo })

    // Check if the repository description is empty.
    if (!repoData.description) {
      // Get the authenticated user's login
      const { data: userData } = await octokit.users.getAuthenticated()
      const userLogin = userData.login

      // Update the repository with the new description
      await octokit.repos.update({
        owner,
        repo,
        description: `https://tinymind.me/${userLogin}`,
      })
      console.log(`Updated repository description to https://tinymind.me/${userLogin}`)
    }
  } catch (error) {
    if (isNotFoundError(error)) {
      await octokit.repos.createForAuthenticatedUser({
        name: repo,
        auto_init: true,
      })
      console.log(`Created new repository: ${repo}`)
    } else {
      throw error
    }
  }

  // Check if README.md exists and needs updating
  try {
    const { data: readmeContent } = await octokit.repos.getContent({
      owner,
      repo,
      path: 'README.md',
    })
    console.log('README content:', readmeContent)
    if ('content' in readmeContent) {
      const decodedContent = Buffer.from(readmeContent.content, 'base64').toString('utf-8')
      console.log('README Decoded content:', decodedContent.trim())
      if (decodedContent.trim() === '' || decodedContent.trim() === '# tinymind-blog') {
        // README.md is empty or contains only the default repo name, update it
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: 'README.md',
          message: 'Update README.md with default content',
          content: Buffer.from(
            '# cici Blog\n\nWrite blog posts and memos at https://tinymind.me with data stored on GitHub.'
          ).toString('base64'),
          sha: readmeContent.sha,
        })
        console.log('README.md updated with default content')
      }
    }
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 404) {
      // Create README.md if it doesn't exist
      const content = Buffer.from(
        'Write blog posts and memos at https://tinymind.me with data stored on GitHub.'
      ).toString('base64')
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'README.md',
        message: 'Initial commit: Add README.md',
        content,
      })
    } else {
      throw error
    }
  }
}

async function ensureContentStructure(octokit: Octokit, owner: string, repo: string) {

  try {
    await createFileIfNotExists(
      octokit,
      owner,
      repo,
      contentPaths.rootKeep(),
      'Initialize content directory',
      ''
    )
    await createFileIfNotExists(
      octokit,
      owner,
      repo,
      contentPaths.blogDirKeep(),
      'Initialize blog directory',
      ''
    )
    await createFileIfNotExists(
      octokit,
      owner,
      repo,
      contentPaths.memos(),
      'Initialize memos.json',
      '[]'
    )
  } catch (error) {
    console.error('Error ensuring content structure:', error)
    throw error
  }
}

async function initializeGitHubStructure(octokit: Octokit, owner: string, repo: string) {
  await ensureRepoExists(octokit, owner, repo)
  await ensureContentStructure(octokit, owner, repo)
}

/** Explicit repo target — lets a provider write to an arbitrary owner/repo
 * (`--repo`) instead of always the token owner's cici repo. */
export interface RepoTarget {
  owner: string
  repo: string
}

export async function createBlogPost(
  title: string,
  content: string,
  accessToken: string,
  discussions: ExternalDiscussion[] = [],
  location?: { latitude?: number; longitude?: number; city?: string; street?: string },
  status: string = 'published',
  target?: RepoTarget
): Promise<void> {
  const octokit = getOctokit(accessToken)
  const { owner, repo } = target ?? await getRepoInfo(accessToken)
  await initializeGitHubStructure(octokit, owner, repo)

  const filename = `${slugFromTitle(title)}.md`
  const path = contentPaths.blogFile(filename)
  const fullContent = buildBlogMarkdown({
    title,
    date: new Date().toISOString(), // Store full ISO string
    content,
    status,
    location,
    discussions,
  })

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: `Add blog post: ${title}`,
    content: Buffer.from(fullContent).toString('base64'),
  })
}

export async function createMemo(
  content: string,
  image: string | undefined,
  accessToken: string,
  location?: { latitude?: number; longitude?: number; city?: string; street?: string }
): Promise<void> {
  console.log('Creating memo...')
  if (!accessToken) {
    throw new Error('Access token is required')
  }
  const octokit = getOctokit(accessToken)
  console.log('Octokit instance created')

  try {
    const { owner, repo } = await getRepoInfo(accessToken)
    console.log('Repo info:', { owner, repo })

    await initializeGitHubStructure(octokit, owner, repo)
    console.log('GitHub structure initialized')

    let memos: Memo[] = []
    let existingSha: string | undefined

    // Try to fetch existing memos
    try {
      console.log('Fetching existing memos...')
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: contentPaths.memos(),
      })

      if (!Array.isArray(response.data) && 'content' in response.data) {
        const existingContent = Buffer.from(response.data.content, 'base64').toString('utf-8')
        memos = JSON.parse(existingContent) as Memo[]
        existingSha = response.data.sha
        console.log('Existing memos fetched')
      }
    } catch (error) {
      if (isNotFoundError(error)) {
        console.log('memos.json does not exist, creating a new file')
      } else {
        console.error('Error fetching existing memos:', error)
        throw error
      }
    }

    // Create new memo
    const newMemo: Memo = {
      id: Date.now().toString(),
      content,
      timestamp: new Date().toISOString(),
      image,
      ...(location?.latitude && { latitude: location.latitude }),
      ...(location?.longitude && { longitude: location.longitude }),
      ...(location?.city && { city: location.city }),
      ...(location?.street && { street: location.street })
    }

    // Add new memo to the beginning of the array
    memos.unshift(newMemo)

    console.log('Updating memos file...')
    // Create or update the file with all memos
    const updateParams: UpdateFileParams = {
      owner,
      repo,
      path: contentPaths.memos(),
      message: 'Add new memo',
      content: Buffer.from(JSON.stringify(memos, null, 2)).toString('base64'),
    }

    if (existingSha) {
      updateParams.sha = existingSha
    }

    await octokit.repos.createOrUpdateFileContents(updateParams)

    console.log('Memo created successfully')
  } catch (error) {
    console.error('Error creating memo:', error)
    throw error
  }
}

export async function deleteMemo(id: string, accessToken: string): Promise<void> {
  console.log('Deleting memo...')
  if (!accessToken) {
    throw new Error('Access token is required')
  }
  const octokit = getOctokit(accessToken)
  console.log('Octokit instance created')

  try {
    const { owner, repo } = await getRepoInfo(accessToken)
    console.log('Repo info:', { owner, repo })

    await initializeGitHubStructure(octokit, owner, repo)
    console.log('GitHub structure initialized')

    let memos: Memo[] = []
    let existingSha: string | undefined

    // Fetch existing memos
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: contentPaths.memos(),
    })

    if (!Array.isArray(response.data) && 'content' in response.data) {
      const existingContent = Buffer.from(response.data.content, 'base64').toString('utf-8')
      memos = JSON.parse(existingContent) as Memo[]
      existingSha = response.data.sha
      console.log('Existing memos fetched')
    }

    // Find and remove the memo
    const newMemos = memos.filter((t) => t.id !== id)
    console.log(newMemos)

    console.log('Updating memos file...')
    // Update the file with all memos
    const updateParams: UpdateFileParams = {
      owner,
      repo,
      path: contentPaths.memos(),
      message: 'Delete a memo',
      content: Buffer.from(JSON.stringify(newMemos, null, 2)).toString('base64'),
      sha: existingSha,
    }

    await octokit.repos.createOrUpdateFileContents(updateParams)

    console.log('Memo deleted successfully')
  } catch (error) {
    console.error('Error deleting memo:', error)
    throw error
  }
}

export async function updateMemo(
  id: string,
  content: string,
  accessToken: string
): Promise<void> {
  console.log('Updating memo...')
  if (!accessToken) {
    throw new Error('Access token is required')
  }
  const octokit = getOctokit(accessToken)
  console.log('Octokit instance created')

  try {
    const { owner, repo } = await getRepoInfo(accessToken)
    console.log('Repo info:', { owner, repo })

    await initializeGitHubStructure(octokit, owner, repo)
    console.log('GitHub structure initialized')

    let memos: Memo[] = []
    let existingSha: string | undefined

    // Fetch existing memos
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: contentPaths.memos(),
    })

    if (!Array.isArray(response.data) && 'content' in response.data) {
      const existingContent = Buffer.from(response.data.content, 'base64').toString('utf-8')
      memos = JSON.parse(existingContent) as Memo[]
      existingSha = response.data.sha
      console.log('Existing memos fetched')
    }

    // Find and update the memo
    const memoIndex = memos.findIndex((t) => t.id === id)
    if (memoIndex === -1) {
      throw new Error('Memo not found')
    }

    memos[memoIndex] = {
      ...memos[memoIndex],
      content,
      // Removed the timestamp update to keep the original timestamp
    }

    console.log('Updating memos file...')
    // Update the file with all memos
    const updateParams: UpdateFileParams = {
      owner,
      repo,
      path: contentPaths.memos(),
      message: 'Update memo',
      content: Buffer.from(JSON.stringify(memos, null, 2)).toString('base64'),
      sha: existingSha,
    }

    await octokit.repos.createOrUpdateFileContents(updateParams)

    console.log('Memo updated successfully')
  } catch (error) {
    console.error('Error updating memo:', error)
    throw error
  }
}

export async function deleteBlogPost(id: string, accessToken: string, target?: RepoTarget): Promise<void> {
  console.log('Deleting blog post...')
  if (!accessToken) {
    throw new Error('Access token is required')
  }
  const octokit = getOctokit(accessToken)

  try {
    const { owner, repo } = target ?? await getRepoInfo(accessToken)

    // Decode the ID and create the file path
    const decodedId = decodeURIComponent(id)
    const filename = `${decodedId}.md`
    const path = contentPaths.blogFile(filename)

    console.log(`Attempting to delete file: ${path}`)

    // Get the current file to retrieve its SHA
    const currentFile = await octokit.repos.getContent({
      owner,
      repo,
      path,
    })

    if (Array.isArray(currentFile.data) || !('sha' in currentFile.data)) {
      throw new Error('Unexpected response when fetching current blog post')
    }

    // Delete the blog post file
    await octokit.repos.deleteFile({
      owner,
      repo,
      path,
      message: 'Delete blog post',
      sha: currentFile.data.sha,
    })

    console.log('Blog post deleted successfully')
  } catch (error) {
    console.error('Error deleting blog post:', error)
    throw error
  }
}


export async function updateBlogPost(
  id: string,
  title: string,
  content: string,
  accessToken: string,
  discussions: ExternalDiscussion[] = [],
  location?: { latitude?: number; longitude?: number; city?: string; street?: string },
  status?: string,
  target?: RepoTarget
): Promise<void> {
  console.log('Updating blog post...')
  if (!accessToken) {
    throw new Error('Access token is required')
  }
  const octokit = getOctokit(accessToken)

  try {
    const { owner, repo } = target ?? await getRepoInfo(accessToken)

    // Get the current file to retrieve its SHA and content
    const { content: existingContent, sha } = await getFileContent(
      octokit,
      owner,
      repo,
      contentPaths.blogPost(id)
    )
    const date = extractDate(existingContent) ?? new Date().toISOString()
    // Preserve existing status if the caller didn't provide one.
    const finalStatus = status !== undefined ? status : (extractStatus(existingContent) ?? 'published')

    const updatedContent = buildBlogMarkdown({
      title,
      date,
      content,
      status: finalStatus,
      location,
      discussions,
    })

    // Update the blog post file
    await updateFileContents(
      octokit,
      owner,
      repo,
      contentPaths.blogPost(id),
      'Update blog post',
      updatedContent,
      sha
    )

    console.log('Blog post updated successfully')
  } catch (error) {
    console.error('Error updating blog post:', error)
    throw error
  }
}

export async function uploadImage(file: File, accessToken: string, target?: RepoTarget): Promise<string> {
  console.log('Uploading image...')
  if (!accessToken) {
    throw new Error('Access token is required')
  }
  const octokit = getOctokit(accessToken)
  console.log('Octokit instance created')

  try {
    const { owner, repo } = target ?? await getRepoInfo(accessToken)
    console.log('Repo info:', { owner, repo })

    // Get the default branch
    const { data: repoData } = await octokit.repos.get({ owner, repo })
    const defaultBranch = repoData.default_branch
    console.log('Default branch:', defaultBranch)

    await initializeGitHubStructure(octokit, owner, repo)
    console.log('GitHub structure initialized')

    // Generate a unique filename
    const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const id = Date.now().toString()
    const ext = path.extname(file.name)
    const filename = `${id}${ext}`
    const filePath = `assets/images/${date}/${filename}`

    // Ensure the directory exists
    await ensureDirectoryExists(octokit, owner, repo, `assets/images/${date}`)

    // Convert file to base64
    const content = await fileToBase64(file)

    // Upload the file
    const response = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message: `Upload image: ${filename}`,
      content,
    })
    console.log(response)

    console.log('Image uploaded successfully')

    // Modify the returned URL to use the correct format
    const rawUrl = response.data.content?.download_url
    if (rawUrl) {
      const parts = rawUrl.split('/')
      const username = parts[3]
      const repo = parts[4]
      const path = parts.slice(6).join('/')

      return `https://github.com/${username}/${repo}/blob/${defaultBranch}/${path}?raw=true`
    }

    throw new Error('Failed to get image URL')
  } catch (error) {
    console.error('Error uploading image:', error)
    throw error
  }
}


export async function getUserLogin(accessToken: string): Promise<string> {
  const octokit = getOctokit(accessToken)
  const { data: user } = await octokit.users.getAuthenticated()
  return user.name ?? user.login
}

export async function getIconUrls(
  usernameOrAccessToken: string
): Promise<{ iconPath: string; appleTouchIconPath: string }> {
  let owner: string
  let repo: string
  let octokit: Octokit | null = null

  // Check if the input is an access token or a username
  if (usernameOrAccessToken.length > 40) {
    // Assuming access tokens are longer than usernames
    try {
      octokit = getOctokit(usernameOrAccessToken)
      const repoInfo = await getRepoInfo(usernameOrAccessToken)
      owner = repoInfo.owner
      repo = repoInfo.repo
    } catch (error) {
      console.error('Error getting authenticated user:', error)
      // Fallback to using the access token as a username
      owner = usernameOrAccessToken
      repo = REPO
    }
  } else {
    owner = usernameOrAccessToken
    repo = REPO
  }

  const defaultIconPath = `https://github.com/${owner}.png`
  const defaultAppleTouchIconPath = `https://github.com/${owner}.png`

  let iconPath = defaultIconPath
  let appleTouchIconPath = defaultAppleTouchIconPath

  if (octokit) {
    iconPath = await getIconUrl(octokit, owner, repo, 'assets/icon.jpg', defaultIconPath)
    appleTouchIconPath = await getIconUrl(
      octokit,
      owner,
      repo,
      'assets/icon-144.jpg',
      defaultAppleTouchIconPath
    )
  }

  return { iconPath, appleTouchIconPath }
}

async function getIconUrl(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  defaultPath: string
): Promise<string> {
  try {
    await octokit.repos.getContent({ owner, repo, path })
    return `https://github.com/${owner}/${repo}/blob/main/${path}?raw=true`
  } catch (error) {
    console.warn(`No icon found in ${path}, using default:`, defaultPath)
    return defaultPath
  }
}
