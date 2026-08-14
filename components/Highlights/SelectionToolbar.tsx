'use client'

import { useEffect, useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'

interface Position {
  top: number
  left: number
}

interface SelectionToolbarProps {
  /** Container ref the toolbar should anchor to (article wrapper). */
  containerRef: React.RefObject<HTMLElement>
  onAddComment: () => void
  /** When true, the toolbar is hidden (e.g. composer is open). */
  suppressed?: boolean
}

/**
 * Floating "+ Comment" button that appears in the right gutter of the
 * article when the user has an active text selection. Position tracks
 * the top of the selection rect, mirroring Google Docs' margin "+" UX.
 */
export function SelectionToolbar({ containerRef, onAddComment, suppressed }: SelectionToolbarProps) {
  const [pos, setPos] = useState<Position | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function update() {
      if (suppressed) {
        setPos(null)
        return
      }
      const sel = document.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPos(null)
        return
      }
      const range = sel.getRangeAt(0)
      const containerEl = containerRef.current
      if (!containerEl) return
      if (!containerEl.contains(range.startContainer) || !containerEl.contains(range.endContainer)) {
        setPos(null)
        return
      }

      const rect = range.getBoundingClientRect()
      const containerRect = containerEl.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        setPos(null)
        return
      }
      // Right gutter of the article column (Google Docs margin "+"). On
      // narrow viewports there is no gutter — float the button just above the
      // selection instead so it stays visible.
      const BUTTON_SIZE = 32 // h-8 w-8
      const gutterLeft = containerRect.width + 8
      const gutterFits = containerRect.left + gutterLeft + BUTTON_SIZE <= window.innerWidth
      setPos(
        gutterFits
          ? { top: rect.top - containerRect.top, left: gutterLeft }
          : {
              top: Math.max(0, rect.top - containerRect.top - 44),
              left: Math.min(
                Math.max(0, rect.left - containerRect.left),
                containerRect.width - BUTTON_SIZE,
              ),
            },
      )
    }

    const onSelectionChange = () => update()
    document.addEventListener('selectionchange', onSelectionChange)
    window.addEventListener('resize', onSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      window.removeEventListener('resize', onSelectionChange)
    }
  }, [containerRef, suppressed])

  if (!pos) return null

  return (
    <button
      type='button'
      onMouseDown={(e) => {
        // Don't blur the selection when clicking — we still need it for
        // anchor capture inside `onAddComment`.
        e.preventDefault()
      }}
      onClick={onAddComment}
      style={{ top: pos.top, left: pos.left }}
      className='absolute z-30 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:scale-110 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring'
      aria-label='Add comment on selection'
    >
      <MessageSquarePlus className='h-4 w-4' />
    </button>
  )
}
