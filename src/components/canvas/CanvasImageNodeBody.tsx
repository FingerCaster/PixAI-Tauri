import { useEffect, useState } from 'react'
import { Brush, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { imageSourceForDisplay, imageSourceForDisplaySync } from '../../lib/platform'
import type { CanvasNodeData } from '../../shared/types'

type CanvasImageNodeBodyProps = {
  node: CanvasNodeData
  emptyLabel?: string
  onPreview: (node: CanvasNodeData, source: string) => void
  onMaskEdit?: (node: CanvasNodeData, source: string) => void
  onNaturalSize?: (node: CanvasNodeData, size: { naturalWidth: number; naturalHeight: number }) => void
}

export function CanvasImageNodeBody({ node, emptyLabel = '图片不可用', onPreview, onMaskEdit, onNaturalSize }: CanvasImageNodeBodyProps) {
  const [imageSource, setImageSource] = useState<string | null>(() => imageSourceForDisplaySync(node.metadata.content, node.metadata.storagePath))

  useEffect(() => {
    let canceled = false
    const syncSource = imageSourceForDisplaySync(node.metadata.content, node.metadata.storagePath)
    setImageSource(syncSource)
    void imageSourceForDisplay(node.metadata.content, node.metadata.storagePath)
      .then((source) => {
        if (!canceled) setImageSource(source)
      })
      .catch(() => {
        if (!canceled) setImageSource(null)
      })
    return () => {
      canceled = true
    }
  }, [node.metadata.content, node.metadata.storagePath])

  if (!imageSource) {
    return (
      <div className="grid h-full min-h-0 place-items-center bg-muted/25 p-2">
        <div className="grid h-full min-h-24 w-full place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      </div>
    )
  }

  return (
    <div className="group relative h-full min-h-0 w-full overflow-hidden bg-muted/25 p-2" data-canvas-image-body="true">
      <div className="relative h-full min-h-0 w-full overflow-hidden rounded-md bg-background/40" data-canvas-image-frame="true">
        <img
          className="absolute inset-0 h-full w-full object-contain"
          src={imageSource}
          alt={node.title}
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget
            if (image.naturalWidth > 0 && image.naturalHeight > 0) {
              onNaturalSize?.(node, { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })
            }
          }}
        />
      </div>
      <button
        className="absolute inset-2 rounded-md"
        type="button"
        title="查看大图"
        aria-label="查看大图"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onPreview(node, imageSource)
        }}
      />
      <span className="pointer-events-none absolute right-3 top-3 inline-grid size-7 place-items-center rounded-lg border border-border bg-background/88 shadow-sm">
        <Maximize2 size={14} />
      </span>
      {onMaskEdit ? (
        <Button
          className="absolute left-3 top-3 size-7 bg-background/88 shadow-sm"
          type="button"
          variant={node.metadata.maskDataUrl ? 'secondary' : 'outline'}
          size="icon"
          title={node.metadata.maskDataUrl ? '编辑 mask' : '添加 mask'}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onMaskEdit(node, imageSource)
          }}
        >
          <Brush size={14} />
        </Button>
      ) : null}
    </div>
  )
}
