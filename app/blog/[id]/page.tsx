import { PostContainer } from './component'
import { getProvider } from '@/lib/runtime/provider'
import BlogDiscussions from '@/components/BlogDiscussions'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import {
  normalizeBlogContent,
  parseContentSegments,
  enrichSegmentsWithDimensions,
  type EnrichedContentSegment,
} from '@/lib/markdown'
import { resolveImageDimensions } from '@/lib/imageDimensions.server'

export const revalidate = 60;

/**
 * Parse the post body into ordered content segments and resolve image
 * dimensions for every gallery image on the server, so galleries render at the
 * correct aspect ratios in the SSR HTML with no layout shift.
 */
async function buildSegments(rawContent: string): Promise<EnrichedContentSegment[]> {
  const segments = parseContentSegments(normalizeBlogContent(rawContent))
  const srcs = segments.flatMap((segment) =>
    segment.type === 'gallery' ? segment.images.map((image) => image.src) : []
  )
  const dimensions = await resolveImageDimensions(srcs)
  return enrichSegmentsWithDimensions(segments, dimensions)
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions);
  const client = getProvider(session?.accessToken)
  // Fetch the single post directly instead of loading every post and .find()-ing.
  const post = await client.getBlogPost(decodeURIComponent(id))

  if (!post) {
    return <div>Post not found</div>
  }

  const segments = await buildSegments(post.content)
  const discussionsComponent = post.discussions ? <BlogDiscussions discussions={post.discussions} /> : null

  return <PostContainer post={post} segments={segments} discussionsComponent={discussionsComponent} />
}
