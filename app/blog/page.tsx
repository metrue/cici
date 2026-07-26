import BlogList from "@/components/BlogList";
import { getProvider } from '@/lib/runtime/provider'
import { isAuthorizedToWrite } from '@/lib/runtime/authz'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

// Listings enumerate the repo live and cache the result in the Next Data Cache
// (see lib/publicClient.ts + lib/cacheTags.ts). No page-level revalidate hack is
// needed: the listing fetch controls freshness and owner writes bust it via tag.

export default async function BlogPage() {
  const session = await getServerSession(authOptions);
  const client = getProvider(session?.accessToken);

  try {
    // Drafts are owner-only (canWrite() alone is true for any authenticated user).
    const posts = await client.getBlogPosts({ includeDrafts: await isAuthorizedToWrite(session) });
    return <BlogList posts={posts} />;
  } catch (error) {
    console.error("Error fetching blog posts:", error);
    return (
      <div className="error-message">
        An error occurred while fetching blog posts: {(error as Error).message}
      </div>
    );
  }
}
