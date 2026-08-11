'use client'

/**
 * In-place photo gallery for blog posts (issue #120). Renders a group of images
 * as a responsive `react-photo-album` row layout; clicking any image opens a
 * full-screen `yet-another-react-lightbox` with zoom, slideshow, and fullscreen.
 *
 * Dimensions are provided by the server (see lib/imageDimensions.server.ts), so
 * the album lays out at the correct aspect ratios in the SSR HTML — no
 * client-side probing, no layout shift.
 */

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { RowsPhotoAlbum, type Photo } from 'react-photo-album'
import 'react-photo-album/rows.css'
import Lightbox from 'yet-another-react-lightbox'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Slideshow from 'yet-another-react-lightbox/plugins/slideshow'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import type { GalleryImageWithSize } from '@/lib/markdown'

interface PhotoGalleryProps {
  images: GalleryImageWithSize[]
  /**
   * Rendered width (px) of the column the gallery sits in. Passed by the layout
   * owner so `react-photo-album` can lay out during SSR (the client re-measures
   * on mount); without it the album renders empty server-side and shifts in.
   */
  containerWidth: number
  /**
   * When true, the first photo is rendered eagerly with fetchpriority=high —
   * set only for the gallery holding the page's LCP image (issue #132).
   */
  priorityFirstImage?: boolean
}

export function PhotoGallery({ images, containerWidth, priorityFirstImage = false }: PhotoGalleryProps) {
  const [index, setIndex] = useState(-1)
  // A react-photo-album Photo already satisfies the lightbox Slide shape, so the
  // same array drives both — no second mapping.
  const photos: Photo[] = useMemo(
    () => images.map((image) => ({
      src: image.src,
      width: image.width,
      height: image.height,
      alt: image.alt,
    })),
    [images]
  )

  if (photos.length === 0) return null

  return (
    <div className='my-4'>
      <RowsPhotoAlbum
        photos={photos}
        targetRowHeight={240}
        spacing={8}
        defaultContainerWidth={containerWidth}
        onClick={({ index: clicked }) => setIndex(clicked)}
        render={{
          image: (props, { photo, index }) => (
            // next/image serves resized AVIF/WebP same-origin via /_next/image
            // (no GitHub redirects). Intrinsic width/height come from the photo
            // (resolved server-side); react-photo-album's computed style sizes it
            // in the row layout. The first photo of the LCP gallery loads eagerly.
            <Image
              src={props.src}
              alt={props.alt ?? ''}
              width={photo.width}
              height={photo.height}
              // Below the md breakpoint the gallery is full-width; above it the
              // prose column caps at containerWidth (no second hardcoded 672).
              sizes={`(max-width: 768px) 100vw, ${containerWidth}px`}
              priority={priorityFirstImage && index === 0}
              style={{ ...props.style, borderRadius: '0.5rem', cursor: 'zoom-in' }}
            />
          ),
        }}
      />
      <Lightbox
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        slides={photos}
        plugins={[Fullscreen, Slideshow, Zoom]}
      />
    </div>
  )
}
