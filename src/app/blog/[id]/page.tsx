import { createGitHubAPIClient } from '@/lib/client'
import { BlogPost } from '@/lib/types'
import { PostContainer } from './component'

export async function generateStaticParams() {
  const username = process.env.GITHUB_USERNAME ?? 'metrue'
  const token = process.env.GITHUB_TOKEN ?? ''
  const client = createGitHubAPIClient(token)
  const posts = await client.getBlogPosts(username)
  const lst = posts.map((post) => ({ id: post.id })).filter(i => !i.id.includes('四月'));
  console.warn('+++')
  console.warn(lst)
  console.warn('+++')
  return lst
}

export default async function Page({ params }: { params: Promise<{ id: string }>}) {
  const { id } = await params
  
  console.warn('-----')
  console.warn(decodeURIComponent(id))
  console.warn('-----')

  const username = process.env.GITHUB_USERNAME ?? 'metrue'
  const client = createGitHubAPIClient('')

  const post: BlogPost | undefined = await client.getBlogPost(`${encodeURIComponent(id)}.md`, username)
  if (!post) {
    return <div>Post not found</div>
  }
  return <PostContainer post={post} />
}
