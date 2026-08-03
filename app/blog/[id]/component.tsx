'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BlogPostContent } from '@/components/BlogPostContent'
import { HighlightLayer } from '@/components/Highlights/HighlightLayer'
import { useUmamiTracking } from '@/components/Analytics'
import type { BlogPost } from '@/lib/types'
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
import { decodeBlogContent, type EnrichedContentSegment } from '@/lib/markdown'

export const PostContainer = ({ post, segments, discussionsComponent }: { post: BlogPost, segments: EnrichedContentSegment[], discussionsComponent?: React.ReactNode }) => {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  // eslint-disable-next-line
  const { data: session, status } = useSession()
  const trackEvent = useUmamiTracking()

  const t = useTranslations('HomePage')

  // Track blog post view
  useEffect(() => {
    trackEvent('blog-post-view', {
      postId: post.id,
      postTitle: post.title,
      postDate: post.date
    })
  }, [trackEvent, post.id, post.title, post.date])

  const decodedTitle = decodeBlogContent(post.title)

  const handleDeleteBlogPost = async () => {
    if (!session?.accessToken) {
      console.error('No access token available')
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            mutation DeleteBlogPost($id: String!) {
              deleteBlogPost(id: $id)
            }
          `,
          variables: { id: post.id },
        }),
      })

      const result = await response.json()
      if (result.errors) {
        throw new Error(result.errors[0].message)
      }

      if (!response.ok) {
        throw new Error('Failed to delete blog post')
      }

      toast({
        title: t('success'),
        description: t('blogPostDeleted'),
        duration: 3000,
      })

      setTimeout(() => {
        router.push('/blog')
      }, 500)
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

  const headerContent = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0'>
            <AiOutlineEllipsis className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onSelect={() => router.push(`/editor?type=blog&id=${post.id}`)}>
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
    </>
  )

  return (
    <HighlightLayer postId={post.id}>
      <BlogPostContent
        title={decodedTitle}
        date={post.date}
        segments={segments}
        slug={post.id}
        headerContent={status === 'authenticated' ? headerContent : null}
        discussionsComponent={discussionsComponent}
        location={post.city ? { city: post.city, street: post.street } : undefined}
      />
    </HighlightLayer>
  )
}
