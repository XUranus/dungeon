import { useState } from 'react'
import type { TopicImage } from '../../types'
import { proxiedImageUrl } from '../../services/api'

interface ImageGalleryProps {
  images: TopicImage[]
}

export default function ImageGallery({ images }: ImageGalleryProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  if (!images || images.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-3">
        {images.map((img, idx) => {
          const thumbSrc = img.thumbnail?.url || img.url
          const largeSrc = img.large?.url || img.url || thumbSrc || ''
          const localPath = img.local_path || img.thumbnail?.local_path || img.large?.local_path
          if (!thumbSrc) return null
          return (
            <button
              key={img.image_id ?? idx}
              onClick={() => setLightboxSrc(proxiedImageUrl(largeSrc, localPath))}
              className="block rounded-lg overflow-hidden border border-gray-200/60 dark:border-gray-600/40 hover:border-neutral-400 dark:hover:border-neutral-500 transition-colors cursor-pointer group"
            >
              <img
                src={proxiedImageUrl(thumbSrc, localPath)}
                alt={`图片 ${idx + 1}`}
                className="max-h-40 w-auto object-cover group-hover:scale-105 transition-transform duration-200"
              />
            </button>
          )
        })}
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 dark:bg-black/85 backdrop-blur-sm"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="大图预览"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  )
}
