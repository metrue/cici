'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HighlightLayer } from '@/components/Highlights/HighlightLayer'
import { useUmamiTracking } from '@/components/Analytics'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { AiOutlineEllipsis } from 'react-icons/ai'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/components/ui/use-toast'

/**
 * Client wrapper for a blog post. Receives the server-rendered article as
 * `children` and mounts it inside HighlightLayer, so the heavy markdown/Prism/
 * KaTeX rendering stays server-side (issues #131, #132). Also fires the Umami
 * page-view event.
 */
export function PostView({
  postId,
  title,
  date,
  children,
}: {
  postId: string
  title: string
  date: string
  children: React.ReactNode
}) {
  const trackEvent = useUmamiTracking()

  useEffect(() => {
    trackEvent('blog-post-view', { postId, postTitle: title, postDate: date })
  }, [trackEvent, postId, title, date])

  return <HighlightLayer postId={postId}>{children}</HighlightLayer>
}

/**
 * Owner-only edit/delete menu shown above the post. Renders nothing for
 * anonymous readers, so it never appears in the public (Lighthouse) DOM.
 */
export function PostActions({ postId }: { postId: string }) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const { data: session, status } = useSession()
  const t = useTranslations('HomePage')

  if (status !== 'authenticated') {
    return null
  }

  const handleDeleteBlogPost = async () => {
    if (!session?.accessToken) {
      console.error('No access token available')
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation DeleteBlogPost($id: String!) {
              deleteBlogPost(id: $id)
            }
          `,
          variables: { id: postId },
        }),
      })

      const result = await response.json()
      if (result.errors) {
        throw new Error(result.errors[0].message)
      }
      if (!response.ok) {
        throw new Error('Failed to delete blog post')
      }

      toast({ title: t('success'), description: t('blogPostDeleted'), duration: 3000 })
      setTimeout(() => router.push('/blog'), 500)
    } catch (error) {
      console.error('Error deleting blog post:', error)
      toast({
        title: t('error'),
        description: t('blogPostDeleteFailed'),
        variant: 'destructive',
        duration: 3000,
      })
    } finally {
      setIsDeleting(false)
      setIsDeleteDialogOpen(false)
    }
  }

  return (
    <div className='flex justify-end mb-6'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0' aria-label='Post actions'>
            <AiOutlineEllipsis className='h-4 w-4' aria-hidden='true' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onSelect={() => router.push(`/editor?type=blog&id=${postId}`)}>
            {t('edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setIsDeleteDialogOpen(true)}>
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmDelete')}</DialogTitle>
            <DialogDescription>{t('undoAction')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setIsDeleteDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button variant='destructive' onClick={handleDeleteBlogPost} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
