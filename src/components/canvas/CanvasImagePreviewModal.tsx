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
    node.metadata.referenceImageId ? 'Reference' : null
  ].filter(Boolean).join(' · ')

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-6xl" aria-label="Canvas 图片预览" aria-describedby={undefined}>
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
