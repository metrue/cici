import { PostView, PostActions } from './component'
import { BlogPostContent } from '@/components/BlogPostContent'
import { getProvider } from '@/lib/runtime/provider'
import BlogDiscussions from '@/components/BlogDiscussions'
import {
  normalizeBlogContent,
  parseContentSegments,
  enrichSegmentsWithDimensions,
  decodeBlogContent,
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
  // Public reads use the anonymous provider: the content repo is public (see
  // lib/runtime/config.ts), so no session token is needed to read a post. Writes
  // (edit/delete) run client-side with the visitor's OAuth token.
  const client = getProvider()
  const post = await client.getBlogPost(decodeURIComponent(id))

  if (!post) {
    return <div>Post not found</div>
  }

  const segments = await buildSegments(post.content)
  const decodedTitle = decodeBlogContent(post.title)
  const discussionsComponent = post.discussions ? <BlogDiscussions discussions={post.discussions} /> : null

  // The article is rendered on the server and passed as children into the
  // client shell, so react-markdown / Prism / KaTeX never reach the browser.
  const article = (
    <BlogPostContent
      title={decodedTitle}
      date={post.date}
      segments={segments}
      slug={post.id}
      headerContent={<PostActions postId={post.id} />}
      discussionsComponent={discussionsComponent}
      location={post.city ? { city: post.city, street: post.street } : undefined}
    />
  )

  return (
    <PostView postId={post.id} title={decodedTitle} date={post.date}>
      {article}
    </PostView>
  )
}
