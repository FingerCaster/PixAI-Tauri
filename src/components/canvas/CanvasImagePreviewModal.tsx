import type { MouseEvent, PointerEvent } from 'react'
import { XIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CanvasNodeData } from '../../shared/types'

type CanvasImagePreviewModalProps = {
  node: CanvasNodeData
  source: string
  onClose: () => void
}

export function CanvasImagePreviewModal({ node, source, onClose }: CanvasImagePreviewModalProps) {
  const meta = [
    node.metadata.mimeType?.replace('image/', '').toUpperCase(),
    node.metadata.naturalWidth && node.metadata.naturalHeight ? `${node.metadata.naturalWidth}x${node.metadata.naturalHeight}` : null,
    node.metadata.historyItemId ? 'History' : null,
    node.metadata.referenceImageId ? 'Reference' : null,
    node.metadata.maskDataUrl ? 'Mask' : null
  ].filter(Boolean).join(' · ')
  const closePreview = (event?: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) => {
    event?.preventDefault()
    event?.stopPropagation()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-6xl" aria-label="Canvas 图片预览" aria-describedby={undefined} showCloseButton={false}>
        <button
          className="absolute right-2 top-2 z-30 inline-flex size-7 items-center justify-center rounded-lg border border-transparent bg-background/88 text-foreground shadow-sm hover:bg-muted"
          type="button"
          title="关闭"
          aria-label="关闭图片预览"
          onPointerDownCapture={closePreview}
          onMouseDown={closePreview}
          onClick={closePreview}
        >
          <XIcon className="size-4 pointer-events-none" />
        </button>
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{node.title}</DialogTitle>
          {meta ? <span className="text-sm text-muted-foreground">{meta}</span> : null}
        </DialogHeader>
        <div className="grid max-h-[74vh] place-items-center overflow-hidden rounded-xl bg-muted">
          <img className="max-h-[74vh] max-w-full object-contain" src={source} alt={node.title} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
