import { Loader2, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CanvasGenerationInputSummary } from '../../services/canvas-workflow'
import type { CanvasNodeData, PartialImagePreview } from '../../shared/types'

type CanvasGenerateNodeBodyProps = {
  node: CanvasNodeData
  inputSummary?: CanvasGenerationInputSummary
  preview?: PartialImagePreview
  onPromptDraftChange: (content: string) => void
  onPromptCommit: (content: string) => void | Promise<void>
  onRun: () => void | Promise<void>
}

export function CanvasGenerateNodeBody({
  node,
  inputSummary,
  preview,
  onPromptDraftChange,
  onPromptCommit,
  onRun
}: CanvasGenerateNodeBodyProps) {
  const status = node.metadata.status || 'idle'
  const running = status === 'running'
  const failed = status === 'failed'
  const showOutputPanel = Boolean(preview || running || failed)

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
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        {inputSummary ? <CanvasGenerationSummary summary={inputSummary} /> : null}
        <textarea
          className="min-h-0 w-full resize-none bg-transparent p-3 text-sm leading-5 outline-none"
          value={node.metadata.content}
          placeholder="本节点提示词"
          data-canvas-stop-zoom="true"
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
          onChange={(event) => onPromptDraftChange(event.target.value)}
          onBlur={(event) => void onPromptCommit(event.target.value)}
        />
        {showOutputPanel ? (
          <div className="border-t border-border bg-muted/25 p-2">
            {preview ? (
              <img className="h-24 w-full rounded-md object-cover" src={preview.dataUrl} alt="Canvas 生成中的流式预览" draggable={false} />
            ) : (
              <div className="grid min-h-14 place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                {failed ? node.metadata.errorMessage || '生成失败' : '生成中'}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CanvasGenerationSummary({ summary }: { summary: CanvasGenerationInputSummary }) {
  const promptLabel = summary.promptTextCount > 0
    ? `提示词 ${summary.promptTextCount}${summary.localPromptPresent ? '+本节点' : ''}`
    : summary.localPromptPresent ? '本节点提示词' : '缺提示词'
  const configLabel = summary.hasConfig ? `参数 ${summary.configCount}` : '参数 0'
  const requestLabel = `工作流请求 ${summary.requestCount}`

  return (
    <div className="border-b border-border bg-muted/20 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <SummaryChip label={promptLabel} warning={summary.missingPrompt} />
        <SummaryChip label={`参考图 ${summary.referenceImageCount}`} />
        <SummaryChip label={configLabel} />
        <SummaryChip label={`批量 ${summary.batchVariantCount}`} />
        <SummaryChip label={requestLabel} />
      </div>
      {summary.missingPrompt ? (
        <div className="mt-1 text-[11px] leading-4 text-destructive">
          缺少有效提示词，运行前请连接文本节点或填写本节点提示词。
        </div>
      ) : null}
    </div>
  )
}

function SummaryChip({ label, warning = false }: { label: string; warning?: boolean }) {
  return (
    <span
      className={
        warning
          ? 'rounded-md border border-destructive/35 bg-destructive/10 px-1.5 py-0.5 text-[11px] leading-4 text-destructive'
          : 'rounded-md border border-border bg-background/70 px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground'
      }
    >
      {label}
    </span>
  )
}

function statusLabel(status: string): string {
  if (status === 'running') return '运行中'
  if (status === 'succeeded') return '完成'
  if (status === 'failed') return '失败'
  return '空闲'
}
