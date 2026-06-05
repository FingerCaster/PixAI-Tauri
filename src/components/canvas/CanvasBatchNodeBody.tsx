import type { CanvasNodeData } from '../../shared/types'

type CanvasBatchNodeBodyProps = {
  node: CanvasNodeData
  onContentDraftChange: (content: string) => void
  onContentCommit: (content: string) => void | Promise<void>
}

export function CanvasBatchNodeBody({
  node,
  onContentDraftChange,
  onContentCommit
}: CanvasBatchNodeBodyProps) {
  const variants = node.metadata.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex h-9 items-center justify-between border-b border-border bg-background/55 px-3 text-xs text-muted-foreground">
        <span className="font-medium">Prompt 变体</span>
        <span className="tabular-nums">{variants.length}</span>
      </div>
      <textarea
        className="min-h-0 w-full resize-none bg-transparent p-3 text-sm leading-5 outline-none"
        value={node.metadata.content}
        placeholder="variant prompt"
        data-canvas-stop-zoom="true"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onChange={(event) => onContentDraftChange(event.target.value)}
        onBlur={(event) => void onContentCommit(event.target.value)}
      />
    </div>
  )
}
