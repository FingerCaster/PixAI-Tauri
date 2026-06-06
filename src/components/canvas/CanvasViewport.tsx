import { useEffect, useRef, useState } from 'react'
import { Minus, Move, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DEFAULT_CANVAS_VIEWPORT, clampCanvasZoom, normalizeViewport } from '../../services/canvas-projects'
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata, CanvasNodeType, CanvasPoint, CanvasViewport as CanvasViewportState, GenerationPreviewState } from '../../shared/types'
import { CanvasNodeLayer, type CanvasNodeLayerHandle } from './CanvasNodeLayer'

type CanvasViewportProps = {
  viewport: CanvasViewportState
  nodes?: CanvasNodeData[]
  connections?: CanvasConnection[]
  loading?: boolean
  onViewportCommit: (viewport: CanvasViewportState) => void | Promise<void>
  onNodeMove?: (nodeId: string, position: CanvasPoint) => void | Promise<void>
  onNodeContentChange?: (nodeId: string, content: string) => void | Promise<void>
  onNodeMetadataChange?: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void | Promise<void>
  onNodeDelete?: (nodeId: string) => void | Promise<void>
  onConnectionAdd?: (fromNodeId: string, toNodeId: string) => void | Promise<void>
  onConnectionCreate?: (input: CanvasConnectedNodeCreateInput) => CanvasNodeData | null | Promise<CanvasNodeData | null>
  onConnectionDelete?: (connectionId: string) => void | Promise<void>
  onTextNodeEnrich?: (nodeId: string) => void | Promise<void>
  onTextNodeGenerate?: (nodeId: string) => void | Promise<void>
  onGenerateNodeRun?: (nodeId: string) => void | Promise<void>
  generationPreviews?: GenerationPreviewState
  promptEnriching?: boolean
  emptyTitle?: string
  emptyDescription?: string
}

type CanvasConnectedNodeCreateInput = {
  sourceNodeId: string
  type: CanvasNodeType
  position: CanvasPoint
}

type DragState = {
  clientX: number
  clientY: number
  viewport: CanvasViewportState
}

const noopAsync = () => undefined

export function CanvasViewport({
  viewport,
  nodes = [],
  connections = [],
  loading = false,
  onViewportCommit,
  onNodeMove = noopAsync,
  onNodeContentChange = noopAsync,
  onNodeMetadataChange = noopAsync,
  onNodeDelete = noopAsync,
  onConnectionAdd = noopAsync,
  onConnectionCreate = () => null,
  onConnectionDelete = noopAsync,
  onTextNodeEnrich = noopAsync,
  onTextNodeGenerate = noopAsync,
  onGenerateNodeRun = noopAsync,
  generationPreviews = {},
  promptEnriching = false,
  emptyTitle = 'Canvas',
  emptyDescription
}: CanvasViewportProps) {
  const [draftViewport, setDraftViewport] = useState(() => normalizeViewport(viewport))
  const latestViewportRef = useRef(draftViewport)
  const dragRef = useRef<DragState | null>(null)
  const nodeLayerRef = useRef<CanvasNodeLayerHandle | null>(null)

  useEffect(() => {
    const next = normalizeViewport(viewport)
    latestViewportRef.current = next
    setDraftViewport(next)
  }, [viewport])

  const setDraft = (next: CanvasViewportState) => {
    const normalized = normalizeViewport(next)
    latestViewportRef.current = normalized
    setDraftViewport(normalized)
  }

  const commitViewport = (next: CanvasViewportState) => {
    const normalized = normalizeViewport(next)
    setDraft(normalized)
    void onViewportCommit(normalized)
  }

  const zoomBy = (delta: number) => {
    commitViewport({
      ...latestViewportRef.current,
      k: clampCanvasZoom(latestViewportRef.current.k + delta)
    })
  }

  const gridSize = Math.max(12, Math.round(32 * draftViewport.k))

  return (
    <div className="canvas-viewport relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
      <div
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
        style={{
          backgroundColor: 'var(--background)',
          backgroundImage:
            'linear-gradient(color-mix(in oklch, var(--border) 52%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklch, var(--border) 52%, transparent) 1px, transparent 1px)',
          backgroundPosition: `${draftViewport.x}px ${draftViewport.y}px`,
          backgroundSize: `${gridSize}px ${gridSize}px`
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || loading) return
          const viewportForPointer = latestViewportRef.current
          const rect = event.currentTarget.getBoundingClientRect()
          const screenPosition = {
            x: Math.round(event.clientX - rect.left),
            y: Math.round(event.clientY - rect.top)
          }
          const position = {
            x: Math.round((screenPosition.x - viewportForPointer.x) / viewportForPointer.k),
            y: Math.round((screenPosition.y - viewportForPointer.y) / viewportForPointer.k)
          }
          if (nodeLayerRef.current?.handleCanvasBlankPointerDown({ position, screenPosition })) {
            event.stopPropagation()
            event.preventDefault()
            return
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = {
            clientX: event.clientX,
            clientY: event.clientY,
            viewport: latestViewportRef.current
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag) return
          setDraft({
            ...drag.viewport,
            x: drag.viewport.x + event.clientX - drag.clientX,
            y: drag.viewport.y + event.clientY - drag.clientY
          })
        }}
        onPointerUp={(event) => {
          if (!dragRef.current) return
          dragRef.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
          commitViewport(latestViewportRef.current)
        }}
        onPointerCancel={() => {
          dragRef.current = null
          setDraft(viewport)
        }}
        onWheel={(event) => {
          if (loading) return
          if (shouldIgnoreViewportWheel(event.target)) return
          event.preventDefault()
          zoomBy(event.deltaY > 0 ? -0.08 : 0.08)
        }}
      >
        {nodes.length === 0 ? (
          <div
            className="absolute left-1/2 top-1/2 grid min-h-28 w-72 -translate-x-1/2 -translate-y-1/2 place-items-center gap-2 rounded-xl border border-dashed border-border bg-background/82 px-5 py-4 text-center shadow-sm backdrop-blur"
            style={{
              transform: `translate(calc(-50% + ${draftViewport.x}px), calc(-50% + ${draftViewport.y}px)) scale(${draftViewport.k})`
            }}
          >
            <div className="text-sm font-semibold text-foreground">{emptyTitle}</div>
            {emptyDescription ? <div className="text-xs leading-5 text-muted-foreground">{emptyDescription}</div> : null}
          </div>
        ) : (
          <CanvasNodeLayer
            ref={nodeLayerRef}
            viewport={draftViewport}
            nodes={nodes}
            connections={connections}
            onNodeMove={onNodeMove}
            onNodeContentChange={onNodeContentChange}
            onNodeMetadataChange={onNodeMetadataChange}
            onNodeDelete={onNodeDelete}
            onConnectionAdd={onConnectionAdd}
            onConnectionCreate={onConnectionCreate}
            onConnectionDelete={onConnectionDelete}
            onTextNodeEnrich={onTextNodeEnrich}
            onTextNodeGenerate={onTextNodeGenerate}
            onGenerateNodeRun={onGenerateNodeRun}
            generationPreviews={generationPreviews}
            promptEnriching={promptEnriching}
          />
        )}
      </div>
      <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background/88 px-2 py-1.5 shadow-sm backdrop-blur">
        <Move size={15} className="text-muted-foreground" />
        <span className="min-w-12 text-right text-xs tabular-nums text-muted-foreground">{Math.round(draftViewport.k * 100)}%</span>
      </div>
      <div className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-lg border border-border bg-background/88 p-1 shadow-sm backdrop-blur">
        <Button type="button" variant="ghost" size="icon-sm" title="缩小" disabled={loading} onClick={() => zoomBy(-0.1)}>
          <Minus />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" title="重置视图" disabled={loading} onClick={() => commitViewport(DEFAULT_CANVAS_VIEWPORT)}>
          <RotateCcw />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" title="放大" disabled={loading} onClick={() => zoomBy(0.1)}>
          <Plus />
        </Button>
      </div>
    </div>
  )
}

function shouldIgnoreViewportWheel(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('textarea, input, [contenteditable="true"], [data-canvas-stop-zoom="true"]'))
}
