/**
 * Single source of truth for cici's content layout.
 *
 * Two layers:
 *   - `contentRel.*` — paths RELATIVE to the content root (`blog/<slug>.md`,
 *     `memos.json`, …), with no `data/` prefix. Use this when the content root
 *     is supplied separately, e.g. the local `--dir <dir>` filesystem client
 *     where the given directory IS the content root.
 *   - `contentPaths.*` — the same paths under the in-repo `data/` root
 *     (`data/blog/<slug>.md`, …). Use this for GitHub API calls and
 *     raw.githubusercontent URLs, where content lives under `data/` in the repo.
 *
 * `contentPaths` composes `CONTENT_ROOT` + `contentRel`, so the two never drift.
 * Change the layout in ONE place here and every consumer follows.
 *
 * Contract: both layers return POSIX paths with no leading slash. This module
 * MUST stay import-safe from client and server components: no `fs`, no `path`,
 * no `process`. Filesystem joining lives in localClient.server.ts.
 */

export const CONTENT_ROOT = 'data'

/** Paths relative to the content root (no `data/` prefix). */
export const contentRel = {
  /** Keep-file for the content root itself. */
  rootKeep: () => '.gitkeep',

  /** Blog posts directory. */
  blogDir: () => 'blog',
  /** Keep-file for the blog directory. */
  blogDirKeep: () => 'blog/.gitkeep',
  /** Blog post from a bare slug (no extension); appends exactly one `.md`. */
  blogPost: (slug: string) => `blog/${slug}.md`,
  /** Blog post from a filename that already carries its `.md` extension. */
  blogFile: (filename: string) => `blog/${filename}`,

  /** Memos store. */
  memos: () => 'memos.json',
  /** Likes store. */
  likes: () => 'likes.json',
  /** Site configuration. */
  siteConfig: () => 'site-config.json',

  /** Highlights directory (one JSON file per post slug). */
  highlightsDir: () => 'highlights',
  /** Highlights file for a given post slug. */
  highlightsFile: (slug: string) => `highlights/${slug}.json`,
} as const

const under = (rel: string) => `${CONTENT_ROOT}/${rel}`

/** Paths under the in-repo `data/` root — for GitHub API + raw URLs. */
export const contentPaths = {
  /** Content root directory. */
  root: () => CONTENT_ROOT,
  rootKeep: () => under(contentRel.rootKeep()),

  blogDir: () => under(contentRel.blogDir()),
  blogDirKeep: () => under(contentRel.blogDirKeep()),
  blogPost: (slug: string) => under(contentRel.blogPost(slug)),
  blogFile: (filename: string) => under(contentRel.blogFile(filename)),

  memos: () => under(contentRel.memos()),
  likes: () => under(contentRel.likes()),
  siteConfig: () => under(contentRel.siteConfig()),

  highlightsDir: () => under(contentRel.highlightsDir()),
  highlightsFile: (slug: string) => under(contentRel.highlightsFile(slug)),
} as const
