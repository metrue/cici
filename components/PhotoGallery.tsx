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
}

export function PhotoGallery({ images, containerWidth }: PhotoGalleryProps) {
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
          image: (props) => (
            // react-photo-album renders a raw <img> for its layout math; `alt`
            // is supplied via props (the linter can't see it through the spread).
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              {...props}
              alt={props.alt ?? ''}
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
