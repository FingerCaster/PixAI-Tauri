import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { formatDuration } from '../../lib/time'
import type { ImageHistoryItem } from '../../shared/types'

export function ImagePreviewModal({ item, onClose }: { item: ImageHistoryItem; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!item.dataUrl) return null

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
          <img src={item.dataUrl} alt={item.prompt} />
        </div>
      </div>
    </div>,
    document.body
  )
}
