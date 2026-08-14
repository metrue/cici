'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { anchorToRange, rangeToAnchor } from '@/lib/highlights/anchoring'
import {
  createHighlight,
  createReply,
  deleteComment,
  deleteHighlight,
  fetchHighlights,
  setHighlightResolved,
  toggleReaction,
} from '@/lib/highlights/clientApi'
import { Highlight, HighlightAnchor } from '@/lib/highlights/schema'

import { CommentCard } from './CommentCard'
import { CommentComposer } from './CommentComposer'
import { CommentRail } from './CommentRail'
import { HighlightMark } from './HighlightMark'
import { SelectionToolbar } from './SelectionToolbar'

interface HighlightLayerProps {
  postId: string
  children: React.ReactNode
}

interface OverlayRect {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Top-level orchestrator for the inline-comments feature on a blog post.
 *
 * Wraps the post's article content with:
 *   - selection capture + floating "+" toolbar
 *   - overlay highlight marks (existing comments + the in-progress one)
 *   - right-rail of Google Docs-style comment cards (lg+)
 *   - composer for new highlights, vertically aligned to the selection
 *   - bottom-sheet composer + stacked cards on narrow viewports
 *
 * Does not modify `BlogPostContent` — the article DOM stays untouched and
 * we render anchored marks/cards on top.
 */
export function HighlightLayer({ postId, children }: HighlightLayerProps) {
  const articleRef = useRef<HTMLDivElement>(null)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [pending, setPending] = useState<HighlightAnchor | null>(null)
  const [pendingRects, setPendingRects] = useState<OverlayRect[]>([])
  const [recomputeKey, setRecomputeKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Fetch highlights on mount
  useEffect(() => {
    let cancelled = false
    fetchHighlights(postId)
      .then((data) => {
        if (cancelled) return
        setHighlights(data.highlights)
        setFingerprint(data.currentFingerprint)
        setDisplayName(data.currentDisplayName)
        setIsOwner(data.isOwner)
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load highlights', err)
        }
      })
    return () => {
      cancelled = true
    }
  }, [postId])

  // Recompute marks/cards on article resize, font load, scroll-zoom
  useEffect(() => {
    const article = articleRef.current
    if (!article) return
    const ro = new ResizeObserver(() => setRecomputeKey((k) => k + 1))
    ro.observe(article)
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => setRecomputeKey((k) => k + 1)).catch(() => {})
    }
    const onResize = () => setRecomputeKey((k) => k + 1)
    window.addEventListener('resize', onResize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Recompute the pending range overlay rects when the pending anchor or
  // viewport changes. The rects keep the "selected" visual state on the
  // article even after focus moves to the textarea (browsers clear native
  // selection on focus change). The rail composer's vertical position is
  // computed inside `CommentRail` so it can share the constraint solver
  // with existing cards.
  useEffect(() => {
    if (!pending) {
      setPendingRects([])
      return
    }
    const article = articleRef.current
    if (!article) return
    const range = anchorToRange(pending, article)
    if (!range) {
      setPendingRects([])
      return
    }
    const articleRect = article.getBoundingClientRect()
    setPendingRects(
      Array.from(range.getClientRects()).map((r) => ({
        top: r.top - articleRect.top,
        left: r.left - articleRect.left,
        width: r.width,
        height: r.height,
      })),
    )
  }, [pending, recomputeKey])

  // Handlers — keep optimistic UI: append/update local state, server is source on next reload
  const handleAddComment = useCallback(() => {
    const sel = document.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const article = articleRef.current
    if (!article) return
    const anchor = rangeToAnchor(range, article)
    if (!anchor) return
    setPending(anchor)
    sel.removeAllRanges()
  }, [])

  const handleSubmitNew = useCallback(
    async (body: string, authorName: string | null) => {
      if (!pending) return
      try {
        const { highlight } = await createHighlight(postId, {
          anchor: pending,
          body,
          authorName,
        })
        setHighlights((prev) => [...prev, highlight])
        setPending(null)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to comment')
        throw err
      }
    },
    [pending, postId],
  )

  const handleReply = useCallback(
    async (highlightId: string, parentId: string | null, body: string, authorName: string | null) => {
      const { comment } = await createReply(postId, highlightId, { parentId, body, authorName })
      setHighlights((prev) =>
        prev.map((h) => (h.id === highlightId ? { ...h, thread: [...h.thread, comment] } : h)),
      )
    },
    [postId],
  )

  const handleReact = useCallback(
    async (highlightId: string, commentId: string, emoji: string) => {
      const { reactions } = await toggleReaction(postId, highlightId, commentId, emoji)
      setHighlights((prev) =>
        prev.map((h) =>
          h.id === highlightId
            ? {
                ...h,
                thread: h.thread.map((c) => (c.id === commentId ? { ...c, reactions } : c)),
              }
            : h,
        ),
      )
    },
    [postId],
  )

  const handleResolve = useCallback(
    async (highlightId: string, resolved: boolean) => {
      const { highlight } = await setHighlightResolved(postId, highlightId, resolved)
      setHighlights((prev) => prev.map((h) => (h.id === highlightId ? highlight : h)))
    },
    [postId],
  )

  const handleDelete = useCallback(
    async (highlightId: string, commentId?: string) => {
      if (commentId) {
        const res = await deleteComment(postId, highlightId, commentId)
        if (res.removedHighlight) {
          setHighlights((prev) => prev.filter((h) => h.id !== highlightId))
        } else {
          setHighlights((prev) =>
            prev.map((h) =>
              h.id === highlightId
                ? { ...h, thread: h.thread.filter((c) => c.id !== commentId) }
                : h,
            ),
          )
        }
      } else {
        await deleteHighlight(postId, highlightId)
        setHighlights((prev) => prev.filter((h) => h.id !== highlightId))
      }
    },
    [postId],
  )

  const article = articleRef.current
  const cancelPending = useCallback(() => {
    setPending(null)
    setError(null)
  }, [])

  // Show the rail column only when there's actually content for it, so the
  // article can center properly on viewports when no comments exist.
  const showRail = highlights.length > 0 || pending !== null

  return (
    <div
      className={
        showRail
          ? 'relative mx-auto w-full lg:flex lg:max-w-6xl lg:items-start lg:gap-12 lg:px-6'
          : 'relative w-full'
      }
    >
      <div
        ref={articleRef}
        className={showRail ? 'relative w-full lg:max-w-3xl lg:flex-1' : 'relative mx-auto w-full max-w-3xl'}
      >
        {children}
        {highlights.map((h) => (
          <HighlightMark
            key={h.id}
            highlight={h}
            articleEl={article}
            recomputeKey={recomputeKey}
          />
        ))}
        {/* Pending highlight overlay: keeps the selected text visually highlighted
            while the composer is open, after the native selection has been cleared. */}
        {pendingRects.map((r, i) => (
          <div
            key={`pending-${i}`}
            className='pointer-events-none absolute z-10 rounded-sm border-b-2 border-primary/60 bg-primary/15'
            style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
          />
        ))}
        <SelectionToolbar
          containerRef={articleRef}
          onAddComment={handleAddComment}
          suppressed={!!pending}
        />
      </div>

      {/* Right-rail (lg+): only mounted when there's content for it.
          Sibling of the article in flex flow — gap-12 on the parent gives the
          breathing room. When the rail is absent, BlogPostContent's own
          `max-w-3xl mx-auto` centers the article in the viewport. The
          pending composer is passed into CommentRail so it participates in
          the same constraint solver as existing cards (no overlap). */}
      {showRail && (
        <aside className='hidden w-72 shrink-0 lg:block'>
          <CommentRail
            highlights={highlights}
            articleEl={article}
            recomputeKey={recomputeKey}
            fingerprint={fingerprint}
            isOwner={isOwner}
            onReply={handleReply}
            onReact={handleReact}
            onResolve={handleResolve}
            onDelete={handleDelete}
            pending={
              pending
                ? {
                    anchor: pending,
                    composer: (
                      <div className='rounded-lg shadow-lg'>
                        <CommentComposer
                          placeholder='Add a comment…'
                          submitLabel='Comment'
                          initialName={displayName ?? ''}
                          onSubmit={handleSubmitNew}
                          onCancel={cancelPending}
                        />
                        {error && (
                          <div className='mt-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive'>
                            {error}
                          </div>
                        )}
                      </div>
                    ),
                  }
                : undefined
            }
          />
        </aside>
      )}

      {/* Mobile (< lg): composer as a centered bottom sheet matching post body width. */}
      {pending && (
        <div className='fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pt-2 lg:hidden'>
          <div className='mx-auto max-w-3xl rounded-lg shadow-lg'>
            <CommentComposer
              placeholder='Add a comment…'
              submitLabel='Comment'
              initialName={displayName ?? ''}
              onSubmit={handleSubmitNew}
              onCancel={cancelPending}
            />
            {error && (
              <div className='mt-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive'>
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile: existing highlights as a stacked list under the article. */}
      {highlights.length > 0 && (
        <div className='mt-6 space-y-3 px-4 lg:hidden'>
          <h2 className='text-sm font-semibold text-muted-foreground'>Inline comments</h2>
          {highlights.map((h) => (
            <CommentCard
              key={h.id}
              highlight={h}
              fingerprint={fingerprint}
              isOwner={isOwner}
              onReply={handleReply}
              onReact={handleReact}
              onResolve={handleResolve}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
