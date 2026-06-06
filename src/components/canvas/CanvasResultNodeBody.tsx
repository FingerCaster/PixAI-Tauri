import { Badge } from '@/components/ui/badge'
import type { CanvasNodeData } from '../../shared/types'
import { CanvasImageNodeBody } from './CanvasImageNodeBody'

type CanvasResultNodeBodyProps = {
  node: CanvasNodeData
  displayTitle: string
  onPreview: (node: CanvasNodeData, source: string) => void
  onMaskEdit?: (node: CanvasNodeData, source: string) => void
  onImageNaturalSize?: (node: CanvasNodeData, size: { naturalWidth: number; naturalHeight: number }) => void
}

export function CanvasResultNodeBody({ node, displayTitle, onPreview, onMaskEdit, onImageNaturalSize }: CanvasResultNodeBodyProps) {
  const status = node.metadata.status || 'idle'
  const hasImage = Boolean(node.metadata.content)

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
      <div className="flex min-h-9 items-center gap-2 border-b border-border bg-background/55 px-2">
        <Badge variant={status === 'failed' ? 'destructive' : status === 'succeeded' ? 'default' : 'outline'} className="shrink-0">
          {statusLabel(status)}
        </Badge>
        {node.metadata.historyItemId ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={node.title}>{displayTitle}</span>
        ) : null}
      </div>
      <div className="min-h-0">
        {hasImage ? (
          <CanvasImageNodeBody
            node={node}
            emptyLabel="结果图片不可用"
            onPreview={onPreview}
            onMaskEdit={onMaskEdit}
            onNaturalSize={onImageNaturalSize}
          />
        ) : (
          <div className="grid h-full min-h-24 place-items-center bg-muted/25 p-2">
            <div className="grid h-full min-h-24 w-full place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            {status === 'failed' ? node.metadata.errorMessage || '失败' : status === 'running' ? '运行中' : '待结果'}
            </div>
          </div>
        )}
      </div>
      <div className="min-h-7 border-t border-border px-2 py-1 text-[11px] text-muted-foreground">
        {node.metadata.mimeType ? node.metadata.mimeType.replace('image/', '').toUpperCase() : 'RESULT'}
      </div>
    </div>
  )
}

function statusLabel(status: string): string {
  if (status === 'running') return '运行中'
  if (status === 'succeeded') return '完成'
  if (status === 'failed') return '失败'
  return '空闲'
}
