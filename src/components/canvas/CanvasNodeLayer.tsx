import { useEffect, useMemo, useRef, useState } from 'react'
import { Link2, Loader2, Maximize2, Move, Trash2, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata, CanvasPoint, CanvasViewport, GenerationPreviewState } from '../../shared/types'
import { CanvasBatchNodeBody } from './CanvasBatchNodeBody'
import { CanvasConfigNodeBody } from './CanvasConfigNodeBody'
import { CanvasGenerateNodeBody } from './CanvasGenerateNodeBody'
import { CanvasImageNodeBody } from './CanvasImageNodeBody'
import { CanvasImagePreviewModal } from './CanvasImagePreviewModal'
import { CanvasMaskEditorModal } from './CanvasMaskEditorModal'
import { CanvasResultNodeBody } from './CanvasResultNodeBody'

type CanvasNodeLayerProps = {
  viewport: CanvasViewport
  nodes: CanvasNodeData[]
  connections: CanvasConnection[]
  onNodeMove: (nodeId: string, position: CanvasPoint) => void | Promise<void>
  onNodeContentChange: (nodeId: string, content: string) => void | Promise<void>
  onNodeMetadataChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void | Promise<void>
  onNodeDelete: (nodeId: string) => void | Promise<void>
  onConnectionAdd: (fromNodeId: string, toNodeId: string) => void | Promise<void>
  onConnectionDelete: (connectionId: string) => void | Promise<void>
  onTextNodeEnrich: (nodeId: string) => void | Promise<void>
  onGenerateNodeRun: (nodeId: string) => void | Promise<void>
  generationPreviews?: GenerationPreviewState
  promptEnriching?: boolean
}

type SelectedCanvasItem = { kind: 'node' | 'connection'; id: string } | null
type DragState = {
  nodeId: string
  clientX: number
  clientY: number
  position: CanvasPoint
  latestPosition: CanvasPoint
}

const NODE_HEADER_HEIGHT = 36
const NODE_HEADER_PADDING_X = 8
const NODE_HEADER_BUTTON_SIZE = 28
const NODE_HEADER_BUTTON_GAP = 4
const IMAGE_NODE_DISPLAY_WIDTH = 320
const IMAGE_NODE_DISPLAY_HEIGHT = 260
const IMAGE_NODE_MAX_DISPLAY_WIDTH = 440
const IMAGE_NODE_MAX_DISPLAY_HEIGHT = 360
const NODE_TITLE_MAX_VISIBLE_LENGTH = 28

export function CanvasNodeLayer({
  viewport,
  nodes,
  connections,
  onNodeMove,
  onNodeContentChange,
  onNodeMetadataChange,
  onNodeDelete,
  onConnectionAdd,
  onConnectionDelete,
  onTextNodeEnrich,
  onGenerateNodeRun,
  generationPreviews = {},
  promptEnriching = false
}: CanvasNodeLayerProps) {
  const [draftNodes, setDraftNodes] = useState(nodes)
  const [selectedItem, setSelectedItem] = useState<SelectedCanvasItem>(null)
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ node: CanvasNodeData; source: string } | null>(null)
  const [maskEditor, setMaskEditor] = useState<{ node: CanvasNodeData; source: string } | null>(null)
  const [expandedTextNodeId, setExpandedTextNodeId] = useState<string | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const dirtyContentNodeIdsRef = useRef<Set<string>>(new Set())
  const displayNodes = useMemo(() => draftNodes.map(normalizeNodeForRender), [draftNodes])
  const nodeById = useMemo(() => new Map(displayNodes.map((node) => [node.id, node])), [displayNodes])
  const selectedConnection = selectedItem?.kind === 'connection' ? connections.find((connection) => connection.id === selectedItem.id) : null
  const selectedNodeId = selectedItem?.kind === 'node' ? selectedItem.id : null
  const selectedConnectionMidpoint = selectedConnection ? connectionMidpoint(selectedConnection, nodeById) : null
  const expandedTextNode = expandedTextNodeId
    ? draftNodes.find((node) => node.id === expandedTextNodeId && node.type === 'text') || null
    : null

  useEffect(() => {
    setDraftNodes((current) => mergeIncomingNodesWithDirtyContent(nodes, current, dirtyContentNodeIdsRef.current))
  }, [nodes])

  const selectNode = (nodeId: string) => setSelectedItem({ kind: 'node', id: nodeId })
  const updateDraftNode = (nodeId: string, patch: Partial<CanvasNodeData>) => {
    setDraftNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)))
  }
  const updateDraftNodeContent = (nodeId: string, content: string) => {
    dirtyContentNodeIdsRef.current.add(nodeId)
    setDraftNodes((current) => current.map((node) => (
      node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node
    )))
  }
  const commitDraftNodeContent = (nodeId: string, content: string) => {
    dirtyContentNodeIdsRef.current.delete(nodeId)
    setDraftNodes((current) => current.map((node) => (
      node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node
    )))
    void onNodeContentChange(nodeId, content)
  }
  const updateDraftNodeMetadata = (node: CanvasNodeData, patch: Partial<CanvasNodeMetadata>) => {
    updateDraftNode(node.id, { metadata: { ...node.metadata, ...patch } })
  }
  const updateDraftImageNaturalSize = (node: CanvasNodeData, size: { naturalWidth: number; naturalHeight: number }) => {
    if (node.metadata.naturalWidth === size.naturalWidth && node.metadata.naturalHeight === size.naturalHeight) return
    updateDraftNode(node.id, { metadata: { ...node.metadata, ...size } })
  }
  const closeExpandedTextNode = () => {
    if (expandedTextNode) {
      commitDraftNodeContent(expandedTextNode.id, expandedTextNode.metadata.content)
    }
    setExpandedTextNodeId(null)
  }
  const startConnection = (nodeId: string) => {
    if (!connectionSourceId) {
      setConnectionSourceId(nodeId)
      selectNode(nodeId)
      return
    }
    if (connectionSourceId === nodeId) {
      setConnectionSourceId(null)
      return
    }
    void onConnectionAdd(connectionSourceId, nodeId)
    setConnectionSourceId(null)
    selectNode(nodeId)
  }

  return (
    <div
      className="absolute left-0 top-0"
      style={{
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
        transformOrigin: '0 0'
      }}
    >
      <svg className="absolute left-0 top-0 overflow-visible text-primary" style={{ width: 1, height: 1 }}>
        {connections.map((connection) => {
          const fromNode = nodeById.get(connection.fromNodeId)
          const toNode = nodeById.get(connection.toNodeId)
          if (!fromNode || !toNode) return null
          const path = connectionPath(fromNode, toNode, selectedNodeId)
          const selected = selectedItem?.kind === 'connection' && selectedItem.id === connection.id
          return (
            <g key={connection.id}>
              <path
                className="cursor-pointer"
                data-canvas-connection-id={connection.id}
                d={path}
                fill="none"
                stroke="currentColor"
                strokeOpacity={selected ? 0.92 : 0.55}
                strokeWidth={selected ? 4 : 3}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="stroke"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  setSelectedItem({ kind: 'connection', id: connection.id })
                }}
              />
            </g>
          )
        })}
      </svg>
      {displayNodes.map((node) => {
        const selected = selectedItem?.kind === 'node' && selectedItem.id === node.id
        const connecting = connectionSourceId === node.id
        const displayTitle = displayNodeTitle(node)
        return (
          <div
            key={node.id}
            className={cn(
              'absolute grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm',
              selected ? 'border-primary shadow-md ring-2 ring-primary/18' : 'border-border'
            )}
            style={{
              left: node.position.x,
              top: node.position.y,
              width: node.width,
              height: node.height,
              zIndex: selected ? 20 : 10
            }}
            data-canvas-node-id={node.id}
            data-canvas-node-type={node.type}
            onPointerDown={(event) => {
              event.stopPropagation()
              selectNode(node.id)
            }}
          >
            <div
              className="flex h-9 items-center gap-1 border-b border-border bg-muted/55 px-2 text-xs"
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.stopPropagation()
                event.currentTarget.setPointerCapture(event.pointerId)
                dragRef.current = {
                  nodeId: node.id,
                  clientX: event.clientX,
                  clientY: event.clientY,
                  position: node.position,
                  latestPosition: node.position
                }
                selectNode(node.id)
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current
                if (!drag || drag.nodeId !== node.id) return
                const nextPosition = {
                  x: Math.round(drag.position.x + (event.clientX - drag.clientX) / viewport.k),
                  y: Math.round(drag.position.y + (event.clientY - drag.clientY) / viewport.k)
                }
                dragRef.current = { ...drag, latestPosition: nextPosition }
                updateDraftNode(node.id, { position: nextPosition })
              }}
              onPointerUp={(event) => {
                const drag = dragRef.current
                if (!drag || drag.nodeId !== node.id) return
                dragRef.current = null
                event.currentTarget.releasePointerCapture(event.pointerId)
                void onNodeMove(node.id, drag.latestPosition)
              }}
              onPointerCancel={() => {
                dragRef.current = null
                setDraftNodes((current) => mergeIncomingNodesWithDirtyContent(nodes, current, dirtyContentNodeIdsRef.current))
              }}
            >
              <Move size={14} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium" title={node.title}>{displayTitle}</span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  className="border-border bg-background/80"
                  variant={connecting ? 'secondary' : 'outline'}
                  size="icon-sm"
                  title={connectionSourceId ? '完成连线' : '开始连线'}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    startConnection(node.id)
                  }}
                >
                  <Link2 />
                </Button>
                <Button
                  type="button"
                  className="border-border bg-background/80 text-muted-foreground hover:text-destructive"
                  variant="outline"
                  size="icon-sm"
                  title="删除节点"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    void onNodeDelete(node.id)
                    setSelectedItem(null)
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {node.type === 'image' ? (
              <CanvasImageNodeBody
                node={node}
                onPreview={(previewNode, source) => setPreview({ node: previewNode, source })}
                onMaskEdit={(maskNode, source) => setMaskEditor({ node: maskNode, source })}
                onNaturalSize={updateDraftImageNaturalSize}
              />
            ) : node.type === 'generate' ? (
              <CanvasGenerateNodeBody
                node={node}
                preview={previewForNode(node, generationPreviews)}
                onPromptDraftChange={(content) => updateDraftNodeContent(node.id, content)}
                onPromptCommit={(content) => commitDraftNodeContent(node.id, content)}
                onRun={() => onGenerateNodeRun(node.id)}
              />
            ) : node.type === 'config' ? (
              <CanvasConfigNodeBody
                node={node}
                onMetadataChange={(patch) => {
                  updateDraftNodeMetadata(node, patch)
                  return onNodeMetadataChange(node.id, patch)
                }}
              />
            ) : node.type === 'batch' ? (
              <CanvasBatchNodeBody
                node={node}
                onContentDraftChange={(content) => updateDraftNodeContent(node.id, content)}
                onContentCommit={(content) => commitDraftNodeContent(node.id, content)}
              />
            ) : node.type === 'result' ? (
              <CanvasResultNodeBody
                node={node}
                displayTitle={displayTitle}
                onPreview={(previewNode, source) => setPreview({ node: previewNode, source })}
                onMaskEdit={(maskNode, source) => setMaskEditor({ node: maskNode, source })}
                onImageNaturalSize={updateDraftImageNaturalSize}
              />
            ) : (
              <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]">
                <textarea
                  className="min-h-0 w-full resize-none bg-transparent p-3 text-sm leading-5 outline-none"
                  value={node.metadata.content}
                  data-canvas-stop-zoom="true"
                  onPointerDown={(event) => event.stopPropagation()}
                  onWheel={(event) => event.stopPropagation()}
                  onChange={(event) => updateDraftNodeContent(node.id, event.target.value)}
                  onBlur={(event) => commitDraftNodeContent(node.id, event.target.value)}
                />
                <div className="flex min-h-9 items-center justify-between border-t border-border bg-background/55 px-2 py-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    title="放大编辑"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      setExpandedTextNodeId(node.id)
                    }}
                  >
                    <Maximize2 />
                    放大
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={!node.metadata.content.trim() || promptEnriching}
                    title="丰富提示词"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      void onTextNodeEnrich(node.id)
                    }}
                  >
                    {promptEnriching ? <Loader2 className="animate-spin" /> : <WandSparkles />}
                    丰富
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {preview ? (
        <CanvasImagePreviewModal node={preview.node} source={preview.source} onClose={() => setPreview(null)} />
      ) : null}
      {maskEditor ? (
        <CanvasMaskEditorModal
          node={maskEditor.node}
          source={maskEditor.source}
          onClose={() => setMaskEditor(null)}
          onSave={(maskDataUrl) => {
            const patch = { maskDataUrl, maskUpdatedAt: new Date().toISOString() }
            updateDraftNodeMetadata(maskEditor.node, patch)
            return onNodeMetadataChange(maskEditor.node.id, patch)
          }}
          onClear={() => {
            const patch = { maskDataUrl: '', maskUpdatedAt: '' }
            updateDraftNodeMetadata(maskEditor.node, patch)
            return onNodeMetadataChange(maskEditor.node.id, patch)
          }}
        />
      ) : null}
      {expandedTextNode ? (
        <Dialog open onOpenChange={(open) => { if (!open) closeExpandedTextNode() }}>
          <DialogContent className="max-w-3xl" aria-label="Canvas 文本节点编辑器" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{expandedTextNode.title}</DialogTitle>
            </DialogHeader>
            <textarea
              className="min-h-[50vh] w-full resize-none rounded-lg border border-border bg-background p-4 text-sm leading-6 outline-none"
              value={expandedTextNode.metadata.content}
              autoFocus
              onChange={(event) => updateDraftNodeContent(expandedTextNode.id, event.target.value)}
            />
          </DialogContent>
        </Dialog>
      ) : null}
      {selectedConnection && selectedConnectionMidpoint ? (
        <div
          className="absolute"
          style={{
            left: selectedConnectionMidpoint.x - 16,
            top: selectedConnectionMidpoint.y - 16,
            zIndex: 30
          }}
        >
          <Button
            className="size-8 bg-background shadow-sm"
            type="button"
            size="icon"
            variant="outline"
            title="删除连线"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              void onConnectionDelete(selectedConnection.id)
              setSelectedItem(null)
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function previewForNode(node: CanvasNodeData, previews: GenerationPreviewState) {
  if (!node.metadata.runId) return undefined
  return previews[node.metadata.runId]?.[node.metadata.requestIndex ?? 0]
}

function mergeIncomingNodesWithDirtyContent(
  incomingNodes: CanvasNodeData[],
  currentNodes: CanvasNodeData[],
  dirtyNodeIds: Set<string>
): CanvasNodeData[] {
  const incomingNodeIds = new Set(incomingNodes.map((node) => node.id))
  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]))
  for (const dirtyNodeId of Array.from(dirtyNodeIds)) {
    if (!incomingNodeIds.has(dirtyNodeId)) dirtyNodeIds.delete(dirtyNodeId)
  }
  return incomingNodes.map((node) => {
    if (!dirtyNodeIds.has(node.id)) return node
    const draftNode = currentNodeById.get(node.id)
    if (!draftNode) return node
    return {
      ...node,
      metadata: {
        ...node.metadata,
        content: draftNode.metadata.content
      }
    }
  })
}

function normalizeNodeForRender(node: CanvasNodeData): CanvasNodeData {
  if (!isImageDisplayNode(node)) return node
  const { width, height } = imageNodeDisplayDimensions(node)
  if (width === node.width && height === node.height) return node
  return { ...node, width, height }
}

function isImageDisplayNode(node: CanvasNodeData): boolean {
  return node.type === 'image' || node.type === 'result'
}

function normalizeDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function displayNodeTitle(node: CanvasNodeData): string {
  const title = node.title.trim()
  return compactNodeTitle(title || fallbackNodeTitle(node))
}

function fallbackNodeTitle(node: CanvasNodeData): string {
  if (node.type === 'result') return '结果节点'
  return '图片节点'
}

function compactNodeTitle(title: string): string {
  if (title.length <= NODE_TITLE_MAX_VISIBLE_LENGTH) return title
  const extensionMatch = /\.[a-z0-9]{2,5}$/i.exec(title)
  const extension = extensionMatch?.[0] || ''
  const body = extension ? title.slice(0, -extension.length) : title
  const startLength = /^history[_-]/i.test(body) ? 16 : 15
  const endLength = Math.max(5, NODE_TITLE_MAX_VISIBLE_LENGTH - startLength - 3 - extension.length)
  if (body.length <= startLength + endLength + 3) return title
  return `${body.slice(0, startLength)}...${body.slice(-endLength)}${extension}`
}

function imageNodeDisplayDimensions(node: CanvasNodeData): { width: number; height: number } {
  const baseWidth = Math.max(IMAGE_NODE_DISPLAY_WIDTH, normalizeDimension(node.width, IMAGE_NODE_DISPLAY_WIDTH))
  const baseHeight = Math.max(IMAGE_NODE_DISPLAY_HEIGHT, normalizeDimension(node.height, IMAGE_NODE_DISPLAY_HEIGHT))
  const naturalWidth = normalizeDimension(node.metadata.naturalWidth || 0, 0)
  const naturalHeight = normalizeDimension(node.metadata.naturalHeight || 0, 0)
  if (!naturalWidth || !naturalHeight) return { width: baseWidth, height: baseHeight }

  const aspectRatio = naturalWidth / naturalHeight
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return { width: baseWidth, height: baseHeight }

  let width = baseWidth
  let height = baseHeight
  if (aspectRatio > 1.45) {
    width = clamp(Math.round(baseHeight * aspectRatio), baseWidth, IMAGE_NODE_MAX_DISPLAY_WIDTH)
  } else if (aspectRatio < 0.72) {
    height = clamp(Math.round(baseWidth / aspectRatio), baseHeight, IMAGE_NODE_MAX_DISPLAY_HEIGHT)
  }
  return { width, height }
}

function connectionAnchor(node: CanvasNodeData, side: 'source' | 'target'): CanvasPoint {
  const buttonClusterWidth = NODE_HEADER_BUTTON_SIZE * 2 + NODE_HEADER_BUTTON_GAP
  const x = side === 'source'
    ? node.position.x + node.width - NODE_HEADER_PADDING_X - buttonClusterWidth / 2
    : node.position.x + NODE_HEADER_PADDING_X
  return {
    x,
    y: node.position.y + NODE_HEADER_HEIGHT / 2
  }
}

function connectionPath(fromNode: CanvasNodeData, toNode: CanvasNodeData, _selectedNodeId: string | null): string {
  const from = connectionAnchor(fromNode, 'source')
  const to = connectionAnchor(toNode, 'target')
  const dx = to.x - from.x
  const dy = to.y - from.y
  const verticalBias = Math.abs(dy) > Math.abs(dx) * 0.72

  if (verticalBias) {
    const curveX = dx >= 0
      ? Math.max(from.x, to.x) + clamp(Math.abs(dy) * 0.28, 72, 180)
      : Math.min(from.x, to.x) - clamp(Math.abs(dy) * 0.28, 72, 180)
    return `M ${from.x} ${from.y} C ${curveX} ${from.y}, ${curveX} ${to.y}, ${to.x} ${to.y}`
  }

  const direction = dx >= 0 ? 1 : -1
  const curveOffset = clamp(Math.abs(dx) * 0.48, 72, 180)
  return `M ${from.x} ${from.y} C ${from.x + curveOffset * direction} ${from.y}, ${to.x - curveOffset * direction} ${to.y}, ${to.x} ${to.y}`
}

function connectionMidpoint(connection: CanvasConnection, nodeById: Map<string, CanvasNodeData>): CanvasPoint | null {
  const fromNode = nodeById.get(connection.fromNodeId)
  const toNode = nodeById.get(connection.toNodeId)
  if (!fromNode || !toNode) return null
  const from = connectionAnchor(fromNode, 'source')
  const to = connectionAnchor(toNode, 'target')
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
