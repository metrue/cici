/**
 * Next.js Data Cache tags — the single source of truth for cache-invalidation
 * keys shared between readers (which tag their `fetch()` calls) and writers
 * (which call `revalidateTag()` after a mutation).
 *
 * Import-safe from both client and server: string constants only, no `fs`,
 * `path`, `process`, or `next/*` imports.
 */

/**
 * Tags the blog directory listing (the live index the homepage and `/blog`
 * are built from). A single per-deployment tag is enough: a cici deployment
 * serves exactly one content repo. The owner's editor mutations revalidate it
 * so edits appear immediately; anonymous reads stay served from the Data Cache
 * within the fetch's `revalidate` window.
 */
export const BLOG_INDEX_TAG = 'blog-index'

/** How long (seconds) an anonymous blog listing may be served from cache. */
export const BLOG_INDEX_REVALIDATE = 300
