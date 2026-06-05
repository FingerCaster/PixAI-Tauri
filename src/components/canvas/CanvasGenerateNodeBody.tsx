import { Loader2, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CanvasNodeData, PartialImagePreview } from '../../shared/types'

type CanvasGenerateNodeBodyProps = {
  node: CanvasNodeData
  preview?: PartialImagePreview
  onPromptDraftChange: (content: string) => void
  onPromptCommit: (content: string) => void | Promise<void>
  onRun: () => void | Promise<void>
}

export function CanvasGenerateNodeBody({
  node,
  preview,
  onPromptDraftChange,
  onPromptCommit,
  onRun
}: CanvasGenerateNodeBodyProps) {
  const status = node.metadata.status || 'idle'
  const running = status === 'running'
  const failed = status === 'failed'

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex min-h-11 items-center gap-2 border-b border-border bg-background/55 px-2">
        <Badge variant={failed ? 'destructive' : running ? 'secondary' : 'outline'} className="shrink-0">
          {statusLabel(status)}
        </Badge>
        <Button
          type="button"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          disabled={running}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            void onRun()
          }}
        >
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          运行
        </Button>
      </div>
      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
        <textarea
          className="min-h-0 w-full resize-none bg-transparent p-3 text-sm leading-5 outline-none"
          value={node.metadata.content}
          placeholder="Canvas prompt"
          data-canvas-stop-zoom="true"
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
          onChange={(event) => onPromptDraftChange(event.target.value)}
          onBlur={(event) => void onPromptCommit(event.target.value)}
        />
        <div className="min-h-20 border-t border-border bg-muted/25 p-2">
          {preview ? (
            <img className="h-24 w-full rounded-md object-cover" src={preview.dataUrl} alt="Canvas 生成中的流式预览" draggable={false} />
          ) : (
            <div className="grid h-24 place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
              {failed ? node.metadata.errorMessage || '生成失败' : running ? '生成中' : '待运行'}
            </div>
          )}
        </div>
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
