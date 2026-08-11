// Server component: the article body is rendered entirely on the server, so
// react-markdown, the Prism syntax highlighter, and KaTeX never ship to (or
// hydrate on) the client. The only client islands inside are PhotoGallery
// (lightbox) and LikeButton. See app/blog/[id]/page.tsx for how this is passed
// as children into the client HighlightLayer. (issues #131, #132)
import 'katex/dist/katex.min.css'


import React from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { format } from 'date-fns'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism'
import LikeButton from './LikeButton'
import { PhotoGallery } from './PhotoGallery'
import type { EnrichedContentSegment } from '@/lib/markdown'

// Rendered width (px) of the prose column, derived from this component's own
// layout below: max-w-3xl (768) − outer px-4 (2×16) − main p-8 (2×32) = 672.
// Passed to PhotoGallery as its SSR layout hint so the number lives with the
// layout that produces it. The client re-measures on mount, so this is a hint.
const PROSE_COLUMN_WIDTH = 672

interface BlogPostContentProps {
  title: string
  date: string
  segments: EnrichedContentSegment[]
  slug: string
  headerContent?: React.ReactNode
  discussionsComponent?: React.ReactNode
  location?: {
    city?: string
    street?: string
  }
}

// Shared ReactMarkdown renderers, defined once and reused across every markdown
// segment. Image-only paragraphs are lifted into gallery segments before they
// reach here, so the `img` renderer only handles inline images inside text.
const markdownComponents: Components = {
  code({
    inline,
    className,
    children,
    ...props
  }: {
    inline?: boolean
    className?: string
    children?: React.ReactNode
  } & React.HTMLAttributes<HTMLElement>) {
    const match = /language-(\w+)/.exec(className || '')
    return !inline && match ? (
      <SyntaxHighlighter
        style={tomorrow as { [key: string]: React.CSSProperties }}
        language={match[1]}
        PreTag='div'
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  a: ({ children, ...props }) => (
    <a
      {...props}
      className='text-gray-600 no-underline hover:text-gray-900 hover:underline hover:underline-offset-4 transition-colors duration-200 break-words'
      target='_blank'
      rel='noopener noreferrer'
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    // text-gray-600 (#4b5563) clears WCAG AA on white (~7:1); gray-400 did not (issue #133).
    <blockquote className='pl-4 border-l-4 border-gray-300 text-gray-600'>
      {children}
    </blockquote>
  ),
  // `node` is destructured out so react-markdown's AST node isn't spread onto
  // the DOM <img>; it is intentionally unused.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  img: ({ node, ...props }) => (
    // Image-only lines are lifted into gallery segments upstream, so anything
    // reaching this renderer is an image inline with text. It must stay valid
    // inside a <p>, so render a plain inline <img> — never a block <div>, which
    // would produce invalid <div>-in-<p> nesting and a hydration error.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={props.alt ?? ''}
      loading='lazy'
      decoding='async'
      className='inline-block max-w-full h-auto rounded align-middle'
    />
  ),
}

export function BlogPostContent({ title, date, segments, slug, headerContent, discussionsComponent, location }: BlogPostContentProps) {
  const firstGalleryIndex = segments.findIndex((segment) => segment.type === 'gallery')
  return (
    <div className='max-w-3xl mx-auto px-4 py-8'>
      {/* headerContent (owner-only PostActions) provides its own layout wrapper
          and renders nothing for anonymous readers — no empty spacer div. */}
      {headerContent}
      <main className='bg-white rounded-lg border border-gray-200 p-8'>
        <header className='mb-8'>
          <h1 className='text-3xl font-bold leading-tight mb-3 text-gray-900'>
            {title}
          </h1>
          <div className='text-sm text-gray-600 flex items-center gap-3'>
            <time dateTime={date}>
              {format(new Date(date), 'MMM d, yyyy')}
            </time>
            {location?.city && (
              <span className='flex items-center gap-1'>🖊 {location.city}{location.street ? ` · ${location.street}` : ''}</span>
            )}
          </div>
        </header>

        <div className='prose prose-lg max-w-none text-gray-900 leading-relaxed prose-p:my-3 prose-img:my-0'>
          {segments.map((segment, i) =>
            segment.type === 'gallery' ? (
              // The first gallery holds the most likely LCP image — render its
              // first photo eagerly with fetchpriority=high (issue #132).
              <PhotoGallery
                key={i}
                images={segment.images}
                containerWidth={PROSE_COLUMN_WIDTH}
                priorityFirstImage={i === firstGalleryIndex}
              />
            ) : (
              <ReactMarkdown
                key={i}
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
              >
                {segment.content}
              </ReactMarkdown>
            )
          )}
        </div>

        {/* Like button section */}
        <div className='mt-8 pt-6 border-t border-gray-100 flex justify-center'>
          <LikeButton type="blog" id={slug} />
        </div>
      </main>

      {/* External discussions section */}
      {discussionsComponent && (
        <div className='mt-6'>
          {discussionsComponent}
        </div>
      )}
    </div>
  )
}
