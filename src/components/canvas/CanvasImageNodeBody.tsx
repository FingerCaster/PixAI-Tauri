import { useEffect, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { imageSourceForDisplay, imageSourceForDisplaySync } from '../../lib/platform'
import type { CanvasNodeData } from '../../shared/types'

type CanvasImageNodeBodyProps = {
  node: CanvasNodeData
  emptyLabel?: string
  onPreview: (node: CanvasNodeData, source: string) => void
}

export function CanvasImageNodeBody({ node, emptyLabel = '图片不可用', onPreview }: CanvasImageNodeBodyProps) {
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
    <button
      className="group relative grid h-full min-h-0 w-full place-items-center bg-muted/25 p-2"
      type="button"
      title="查看大图"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onPreview(node, imageSource)
      }}
    >
      <img className="h-full min-h-0 w-full rounded-md object-contain" src={imageSource} alt={node.title} draggable={false} />
      <span className="pointer-events-none absolute right-3 top-3 inline-grid size-7 place-items-center rounded-lg border border-border bg-background/88 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        <Maximize2 size={14} />
      </span>
    </button>
  )
}
