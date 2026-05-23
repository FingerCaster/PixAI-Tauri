import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { formatDuration } from '../../lib/time'
import { imageSourceForDisplay } from '../../lib/platform'
import type { ImageHistoryItem } from '../../shared/types'

export function ImagePreviewModal({ item, onClose }: { item: ImageHistoryItem; onClose: () => void }) {
  const [imageSource, setImageSource] = useState<string | null>(item.dataUrl?.startsWith('data:') ? item.dataUrl : null)
  useEffect(() => {
    let canceled = false
    void imageSourceForDisplay(item.dataUrl, item.storagePath).then((source) => {
      if (!canceled) setImageSource(source)
    })
    return () => {
      canceled = true
    }
  }, [item.dataUrl, item.storagePath])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!imageSource) return null

  return createPortal(
    <div
      className="modal-backdrop image-preview-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="image-preview-panel"
        role="dialog"
        aria-modal="true"
        aria-label="图片预览"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="image-preview-head">
          <div>
            <strong>{item.prompt}</strong>
            <span>
              {item.model} · {item.size || item.ratio}
              {item.durationMs != null ? ` · ${formatDuration(item.durationMs)}` : ''}
            </span>
          </div>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="image-preview-stage">
          <img src={imageSource} alt={item.prompt} />
        </div>
      </div>
    </div>,
    document.body
  )
}
