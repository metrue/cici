import { Octokit } from '@octokit/rest';

const REPO = 'cici';

export type UpdateFileParams = Parameters<Octokit['repos']['createOrUpdateFileContents']>[0];

export interface RepoInfo {
  owner: string;
  repo: string;
}

export function getOctokit(accessToken: string | undefined): Octokit {
  if (!accessToken) {
    throw new Error('Access token is required');
  }
  return new Octokit({ auth: accessToken });
}

export async function getRepoInfo(accessToken: string | undefined): Promise<RepoInfo> {
  if (!accessToken) {
    throw new Error('Access token is required');
  }
  const octokit = getOctokit(accessToken);
  try {
    const { data: user } = await octokit.users.getAuthenticated();
    return {
      owner: user.login,
      repo: REPO,
    };
  } catch (error) {
    console.error('Error getting authenticated user:', error);
    throw new Error('Failed to get authenticated user');
  }
}

export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<{ content: string; sha: string }> {
  const response = await octokit.repos.getContent({ owner, repo, path });
  if (Array.isArray(response.data) || !('content' in response.data)) {
    throw new Error('Unexpected response from GitHub API');
  }
  return {
    content: Buffer.from(response.data.content, 'base64').toString('utf-8'),
    sha: response.data.sha,
  };
}

export async function updateFileContents(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  message: string,
  content: string,
  sha?: string
): Promise<void> {
  const params: UpdateFileParams = {
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString('base64'),
  };
  if (sha) {
    params.sha = sha;
  }
  await octokit.repos.createOrUpdateFileContents(params);
}

export async function ensureDirectoryExists(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<void> {
  try {
    await octokit.repos.getContent({ owner, repo, path });
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 404) {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: `${path}/.gitkeep`,
        message: `Create directory: ${path}`,
        content: '',
      });
    } else {
      throw error;
    }
  }
}

export async function fileToBase64(file: { arrayBuffer: () => Promise<ArrayBuffer> }): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  return buffer.toString('base64')
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'status' in error && error.status === 404;
}

export async function createFileIfNotExists(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  message: string,
  content: string
): Promise<void> {
  try {
    await octokit.repos.getContent({ owner, repo, path });
    console.log(`File ${path} already exists.`);
  } catch (error) {
    if (isNotFoundError(error)) {
      console.log(`Creating file ${path}...`);
      try {
        await updateFileContents(octokit, owner, repo, path, message, content);
        console.log(`File ${path} created successfully.`);
      } catch (createError) {
        console.error(`Error creating file ${path}:`, createError);
        throw createError;
      }
    } else {
      console.error(`Error checking file ${path}:`, error);
      throw error;
    }
  }
}