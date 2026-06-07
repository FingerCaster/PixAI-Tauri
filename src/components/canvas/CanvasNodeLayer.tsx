import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Brush, Eye, Link2, Loader2, Maximize2, Move, PanelTop, Play, RefreshCw, Trash2, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { imageSourceForDisplay } from '../../lib/platform'
import { canvasConnectionKindForNodes } from '../../services/canvas-projects'
import { summarizeCanvasGenerationInput } from '../../services/canvas-workflow'
import type { CanvasConnection, CanvasConnectionKind, CanvasNodeData, CanvasNodeMetadata, CanvasNodeType, CanvasPoint, CanvasProject, CanvasViewport, GenerationPreviewState } from '../../shared/types'
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
  onConnectionCreate: (input: CanvasConnectedNodeCreateInput) => CanvasNodeData | null | Promise<CanvasNodeData | null>
  onConnectionDelete: (connectionId: string) => void | Promise<void>
  onTextNodeEnrich: (nodeId: string) => void | Promise<void>
  onTextNodeGenerate: (nodeId: string) => void | Promise<void>
  onGenerateNodeRun: (nodeId: string) => void | Promise<void>
  generationPreviews?: GenerationPreviewState
  promptEnriching?: boolean
  promptEnrichingNodeId?: string | null
}

export type CanvasNodeLayerHandle = {
  handleCanvasBlankPointerDown: (input: CanvasBlankPointerDownInput) => boolean
  focusNode: (nodeId: string, options?: { highlight?: boolean }) => void
}

type SelectedCanvasItem = { kind: 'node' | 'connection'; id: string } | null
type CanvasConnectedNodeCreateInput = {
  sourceNodeId: string
  type: CanvasNodeType
  position: CanvasPoint
}
type CanvasBlankPointerDownInput = {
  position: CanvasPoint
  screenPosition: CanvasPoint
}
type PendingConnectionCreateMenu = {
  sourceNodeId: string
  position: CanvasPoint
}
type ConnectionCreateOption = {
  type: CanvasNodeType
  label: string
  description: string
  icon: React.ReactNode
}
type DragState = {
  nodeId: string
  clientX: number
  clientY: number
  position: CanvasPoint
  latestPosition: CanvasPoint
}

const NODE_HEADER_HEIGHT = 36
const NODE_HEADER_PADDING_X = 8
const IMAGE_NODE_DISPLAY_WIDTH = 320
const IMAGE_NODE_DISPLAY_HEIGHT = 260
const IMAGE_NODE_MAX_DISPLAY_WIDTH = 440
const IMAGE_NODE_MAX_DISPLAY_HEIGHT = 360
const GENERATE_NODE_MIN_DISPLAY_HEIGHT = 340
const NODE_TITLE_MAX_VISIBLE_LENGTH = 28

export const CanvasNodeLayer = forwardRef<CanvasNodeLayerHandle, CanvasNodeLayerProps>(function CanvasNodeLayer({
  viewport,
  nodes,
  connections,
  onNodeMove,
  onNodeContentChange,
  onNodeMetadataChange,
  onNodeDelete,
  onConnectionAdd,
  onConnectionCreate,
  onConnectionDelete,
  onTextNodeEnrich,
  onTextNodeGenerate,
  onGenerateNodeRun,
  generationPreviews = {},
  promptEnriching = false,
  promptEnrichingNodeId = null
}, ref) {
  const [draftNodes, setDraftNodes] = useState(nodes)
  const [selectedItem, setSelectedItem] = useState<SelectedCanvasItem>(null)
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null)
  const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreateMenu | null>(null)
  const [preview, setPreview] = useState<{ node: CanvasNodeData; source: string } | null>(null)
  const [maskEditor, setMaskEditor] = useState<{ node: CanvasNodeData; source: string } | null>(null)
  const [expandedTextNodeId, setExpandedTextNodeId] = useState<string | null>(null)
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const dirtyContentNodeIdsRef = useRef<Set<string>>(new Set())
  const highlightTimeoutRef = useRef<number | null>(null)
  const displayNodes = useMemo(() => draftNodes.map(normalizeNodeForRender), [draftNodes])
  const generationInputSummaryByNodeId = useMemo(() => {
    const project = renderCanvasProject(displayNodes, connections, viewport)
    return new Map(
      displayNodes
        .filter((node) => node.type === 'generate')
        .map((node) => [node.id, summarizeCanvasGenerationInput(project, node.id)])
    )
  }, [connections, displayNodes, viewport])
  const nodeById = useMemo(() => new Map(displayNodes.map((node) => [node.id, node])), [displayNodes])
  const connectionSourceNode = connectionSourceId ? nodeById.get(connectionSourceId) || null : null
  const pendingConnectionSourceNode = pendingConnectionCreate ? nodeById.get(pendingConnectionCreate.sourceNodeId) || null : null
  const pendingConnectionOptions = pendingConnectionSourceNode ? connectionCreateOptionsForSource(pendingConnectionSourceNode) : []
  const selectedConnection = selectedItem?.kind === 'connection' ? connections.find((connection) => connection.id === selectedItem.id) : null
  const selectedNodeId = selectedItem?.kind === 'node' ? selectedItem.id : null
  const selectedConnectionMidpoint = selectedConnection ? connectionMidpoint(selectedConnection, nodeById) : null
  const expandedTextNode = expandedTextNodeId
    ? draftNodes.find((node) => node.id === expandedTextNodeId && node.type === 'text') || null
    : null

  useEffect(() => {
    setDraftNodes((current) => mergeIncomingNodesWithDirtyContent(nodes, current, dirtyContentNodeIdsRef.current))
  }, [nodes])

  useEffect(() => {
    if (selectedItem?.kind === 'node' && !nodeById.has(selectedItem.id)) setSelectedItem(null)
    if (connectionSourceId && !nodeById.has(connectionSourceId)) setConnectionSourceId(null)
    if (pendingConnectionCreate && !nodeById.has(pendingConnectionCreate.sourceNodeId)) setPendingConnectionCreate(null)
    if (highlightedNodeId && !nodeById.has(highlightedNodeId)) setHighlightedNodeId(null)
  }, [connectionSourceId, highlightedNodeId, nodeById, pendingConnectionCreate, selectedItem])

  useEffect(() => () => {
    if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current)
  }, [])

  const flashNode = (nodeId: string) => {
    if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current)
    setHighlightedNodeId(nodeId)
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedNodeId((current) => (current === nodeId ? null : current))
      highlightTimeoutRef.current = null
    }, 1600)
  }

  useImperativeHandle(ref, () => ({
    focusNode: (nodeId, options) => {
      if (!nodeById.has(nodeId)) return
      setSelectedItem({ kind: 'node', id: nodeId })
      if (options?.highlight) flashNode(nodeId)
    },
    handleCanvasBlankPointerDown: (input) => {
      if (!connectionSourceId) {
        if (pendingConnectionCreate) setPendingConnectionCreate(null)
        return false
      }
      const sourceNode = nodeById.get(connectionSourceId)
      if (!sourceNode) {
        setConnectionSourceId(null)
        setPendingConnectionCreate(null)
        return false
      }
      const options = connectionCreateOptionsForSource(sourceNode)
      if (options.length === 0) {
        setConnectionSourceId(null)
        setPendingConnectionCreate(null)
        return false
      }
      setPendingConnectionCreate({
        sourceNodeId: sourceNode.id,
        position: input.position
      })
      setSelectedItem({ kind: 'node', id: sourceNode.id })
      return true
    }
  }), [connectionSourceId, nodeById, pendingConnectionCreate])

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
    return onNodeContentChange(nodeId, content)
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
      void commitDraftNodeContent(expandedTextNode.id, expandedTextNode.metadata.content)
    }
    setExpandedTextNodeId(null)
  }
  const deleteCanvasNode = (node: CanvasNodeData) => {
    void onNodeDelete(node.id)
    setSelectedItem(null)
    if (connectionSourceId === node.id) setConnectionSourceId(null)
    if (pendingConnectionCreate?.sourceNodeId === node.id) setPendingConnectionCreate(null)
  }
  useEffect(() => {
    if (selectedItem?.kind !== 'node') return
    const selectedNode = nodeById.get(selectedItem.id)
    if (!selectedNode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || isTextEditingTarget(event.target)) return
      event.preventDefault()
      deleteCanvasNode(selectedNode)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [connectionSourceId, nodeById, onNodeDelete, pendingConnectionCreate, selectedItem])
  const openNodePreview = (node: CanvasNodeData) => {
    void resolveNodeImageSource(node).then((source) => {
      if (source) setPreview({ node, source })
    })
  }
  const openNodeMaskEditor = (node: CanvasNodeData) => {
    void resolveNodeImageSource(node).then((source) => {
      if (source) setMaskEditor({ node, source })
    })
  }
  const generateFromTextNode = (node: CanvasNodeData) => {
    if (node.type !== 'text' || !node.metadata.content.trim()) return
    void Promise.resolve(commitDraftNodeContent(node.id, node.metadata.content))
      .then(() => onTextNodeGenerate(node.id))
    selectNode(node.id)
  }
  const runGenerateNode = (node: CanvasNodeData) => {
    if (node.type !== 'generate' || node.metadata.status === 'running') return
    void onGenerateNodeRun(node.id)
    selectNode(node.id)
  }
  const startConnection = (node: CanvasNodeData) => {
    if (!connectionSourceId) {
      if (!sourcePortLabel(node)) return
      setConnectionSourceId(node.id)
      setPendingConnectionCreate(null)
      selectNode(node.id)
      return
    }
    if (connectionSourceId === node.id) {
      setConnectionSourceId(null)
      setPendingConnectionCreate(null)
      return
    }
    if (!connectionSourceNode || !targetPortLabel(connectionSourceNode, node)) return
    void onConnectionAdd(connectionSourceId, node.id)
    setConnectionSourceId(null)
    setPendingConnectionCreate(null)
    selectNode(node.id)
  }
  const createConnectedNode = (type: CanvasNodeType) => {
    if (!pendingConnectionCreate) return
    const input = {
      sourceNodeId: pendingConnectionCreate.sourceNodeId,
      type,
      position: pendingConnectionCreate.position
    }
    void Promise.resolve(onConnectionCreate(input)).then((node) => {
      if (node) selectNode(node.id)
    })
    setPendingConnectionCreate(null)
    setConnectionSourceId(null)
  }
  const closeConnectionCreateMenu = () => {
    setPendingConnectionCreate(null)
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
          const midpoint = connectionMidpoint(connection, nodeById)
          const label = connectionKindLabel(connection.kind)
          const labelWidth = label.length * 14 + 14
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
              {midpoint ? (
                <g pointerEvents="none" transform={`translate(${midpoint.x} ${midpoint.y})`}>
                  <rect
                    x={-labelWidth / 2}
                    y={-10}
                    width={labelWidth}
                    height={20}
                    rx={5}
                    fill="var(--background)"
                    stroke="currentColor"
                    strokeOpacity={selected ? 0.7 : 0.38}
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    className="fill-current text-[11px] font-medium"
                  >
                    {label}
                  </text>
                </g>
              ) : null}
            </g>
          )
        })}
      </svg>
      {displayNodes.map((node) => {
        const selected = selectedItem?.kind === 'node' && selectedItem.id === node.id
        const highlighted = highlightedNodeId === node.id
        const connecting = connectionSourceId === node.id
        const sourceLabel = sourcePortLabel(node)
        const targetLabel = connectionSourceNode && !connecting ? targetPortLabel(connectionSourceNode, node) : null
        const displayTitle = displayNodeTitle(node)
        const currentNodeEnriching = promptEnrichingNodeId === node.id
        return (
          <div
            key={node.id}
            className={cn(
              'group/canvas-node absolute overflow-visible',
              selected ? 'z-20' : 'z-10'
            )}
            style={{
              left: node.position.x,
              top: node.position.y,
              width: node.width,
              height: node.height
            }}
            data-canvas-node-id={node.id}
            data-canvas-node-type={node.type}
            data-canvas-node-selected={selected ? 'true' : undefined}
            onPointerDown={(event) => {
              event.stopPropagation()
              selectNode(node.id)
            }}
          >
            <CanvasNodeActionToolbar
              node={node}
              visible={selected || connecting}
              sourceLabel={sourceLabel}
              connecting={connecting}
              onStartConnection={() => startConnection(node)}
              onPreview={() => openNodePreview(node)}
              onMaskEdit={() => openNodeMaskEditor(node)}
              onRunGenerate={() => runGenerateNode(node)}
              onGenerateFromText={() => generateFromTextNode(node)}
              onDelete={() => deleteCanvasNode(node)}
            />
            <div
              className={cn(
                'grid h-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm',
                selected ? 'border-primary shadow-md ring-2 ring-primary/18' : 'border-border',
                highlighted ? 'ring-4 ring-primary/45 shadow-lg shadow-primary/20 transition-shadow duration-300' : ''
              )}
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
              {targetLabel ? (
                <Button
                  type="button"
                  className="h-7 shrink-0 border-primary/45 bg-primary/8 px-2 text-[11px]"
                  variant="outline"
                  size="sm"
                  title={`连接为${targetLabel}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    startConnection(node)
                  }}
                >
                  <Link2 size={13} />
                  {targetLabel}
                </Button>
              ) : null}
              <span className="min-w-0 flex-1 truncate font-medium" title={node.title}>{displayTitle}</span>
              <div className="flex shrink-0 items-center gap-1">
                {sourceLabel && (!connectionSourceNode || connecting) ? (
                  <Button
                    type="button"
                    className="h-7 border-border bg-background/80 px-2 text-[11px]"
                    variant={connecting ? 'secondary' : 'outline'}
                    size="sm"
                    title={connecting ? '取消连线' : `从${sourceLabel}端口连线`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      startConnection(node)
                    }}
                  >
                    <Link2 size={13} />
                    {sourceLabel}
                  </Button>
                ) : null}
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
                inputSummary={generationInputSummaryByNodeId.get(node.id)}
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
                  onBlur={(event) => void commitDraftNodeContent(node.id, event.target.value)}
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
                    {currentNodeEnriching ? <Loader2 className="animate-spin" /> : <WandSparkles />}
                    丰富
                  </Button>
                </div>
              </div>
            )}
            </div>
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
      {pendingConnectionCreate && pendingConnectionSourceNode && pendingConnectionOptions.length > 0 ? (
        <ConnectionCreateMenu
          pending={pendingConnectionCreate}
          viewport={viewport}
          sourceNode={pendingConnectionSourceNode}
          options={pendingConnectionOptions}
          onCreate={createConnectedNode}
          onClose={closeConnectionCreateMenu}
        />
      ) : null}
    </div>
  )
})

function ConnectionCreateMenu({
  pending,
  viewport,
  sourceNode,
  options,
  onCreate,
  onClose
}: {
  pending: PendingConnectionCreateMenu
  viewport: CanvasViewport
  sourceNode: CanvasNodeData
  options: ConnectionCreateOption[]
  onCreate: (type: CanvasNodeType) => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute z-40 w-52 rounded-lg border border-border bg-background/95 p-1.5 text-card-foreground shadow-lg backdrop-blur"
      data-canvas-connection-create-menu="true"
      style={{
        left: pending.position.x,
        top: pending.position.y,
        transform: `scale(${1 / viewport.k})`,
        transformOrigin: '0 0'
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-muted-foreground">
        从{sourcePortLabel(sourceNode)}连接
      </div>
      <div className="grid gap-1">
        {options.map((option) => (
          <Button
            key={option.type}
            type="button"
            variant="ghost"
            className="h-auto justify-start gap-2 px-2 py-2 text-left"
            title={`创建${option.label}`}
            onClick={() => onCreate(option.type)}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-muted/45">
              {option.icon}
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="text-xs font-medium leading-4">{option.label}</span>
              <span className="text-[11px] leading-4 text-muted-foreground">{option.description}</span>
            </span>
          </Button>
        ))}
      </div>
      <div className="mt-1 border-t border-border pt-1">
        <Button
          type="button"
          variant="ghost"
          className="h-7 w-full justify-start px-2 text-[11px] text-muted-foreground"
          onClick={onClose}
        >
          取消
        </Button>
      </div>
    </div>
  )
}

function connectionCreateOptionsForSource(sourceNode: CanvasNodeData): ConnectionCreateOption[] {
  if (sourceNode.type === 'generate') {
    return [
      {
        type: 'result',
        label: '结果节点',
        description: '接收本次生成图片',
        icon: <PanelTop size={14} />
      }
    ]
  }
  if (sourceNode.type === 'text') {
    return [
      {
        type: 'generate',
        label: '生成节点',
        description: '连接为提示词输入',
        icon: <WandSparkles size={14} />
      }
    ]
  }
  if (sourceNode.type === 'image' || sourceNode.type === 'result') {
    return [
      {
        type: 'generate',
        label: '生成节点',
        description: '连接为参考图输入',
        icon: <WandSparkles size={14} />
      }
    ]
  }
  if (sourceNode.type === 'config') {
    return [
      {
        type: 'generate',
        label: '生成节点',
        description: '连接为参数输入',
        icon: <WandSparkles size={14} />
      }
    ]
  }
  if (sourceNode.type === 'batch') {
    return [
      {
        type: 'generate',
        label: '生成节点',
        description: '连接为批量输入',
        icon: <WandSparkles size={14} />
      }
    ]
  }
  return []
}

function CanvasNodeActionToolbar({
  node,
  visible,
  sourceLabel,
  connecting,
  onStartConnection,
  onPreview,
  onMaskEdit,
  onRunGenerate,
  onGenerateFromText,
  onDelete
}: {
  node: CanvasNodeData
  visible: boolean
  sourceLabel: string | null
  connecting: boolean
  onStartConnection: () => void
  onPreview: () => void
  onMaskEdit: () => void
  onRunGenerate: () => void
  onGenerateFromText: () => void
  onDelete: () => void
}) {
  const hasImageSource = (node.type === 'image' || node.type === 'result') && Boolean(node.metadata.content)
  const canGenerateFromText = node.type === 'text' && Boolean(node.metadata.content.trim())
  const running = node.type === 'generate' && node.metadata.status === 'running'
  const retry = node.type === 'generate' && (node.metadata.status === 'failed' || node.metadata.status === 'succeeded')

  return (
    <div
      className={cn(
        'absolute right-0 top-0 z-30 flex max-w-[calc(100%-1rem)] -translate-y-[calc(100%+0.25rem)] items-center gap-1 rounded-lg border border-border bg-background/92 p-1 shadow-md backdrop-blur transition-opacity',
        visible
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0 group-hover/canvas-node:pointer-events-auto group-hover/canvas-node:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'
      )}
      data-canvas-node-action-toolbar="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {node.type === 'text' ? (
        <ToolbarButton
          label="生成"
          title="从文本生成"
          icon={<WandSparkles size={14} />}
          disabled={!canGenerateFromText}
          onClick={onGenerateFromText}
        />
      ) : null}
      {hasImageSource ? (
        <>
          <ToolbarButton
            label="预览"
            title="预览图片"
            icon={<Eye size={14} />}
            onClick={onPreview}
          />
          <ToolbarButton
            label={node.metadata.maskDataUrl ? 'Mask' : 'Mask'}
            title={node.metadata.maskDataUrl ? '编辑 mask' : '添加 mask'}
            icon={<Brush size={14} />}
            onClick={onMaskEdit}
          />
        </>
      ) : null}
      {node.type === 'generate' ? (
        <ToolbarButton
          label={retry ? '重试' : '运行'}
          title={retry ? '重试生成' : '运行生成'}
          icon={running ? <Loader2 size={14} className="animate-spin" /> : retry ? <RefreshCw size={14} /> : <Play size={14} />}
          disabled={running}
          onClick={onRunGenerate}
        />
      ) : null}
      {sourceLabel ? (
        <ToolbarButton
          label={connecting ? '取消' : '连接'}
          title={connecting ? '取消节点连线' : `从${sourceLabel}连接下游`}
          icon={<Link2 size={14} />}
          onClick={onStartConnection}
        />
      ) : null}
      <ToolbarButton
        label="删除"
        title="删除节点"
        icon={<Trash2 size={14} />}
        danger
        onClick={onDelete}
      />
    </div>
  )
}

function ToolbarButton({
  label,
  title,
  icon,
  disabled = false,
  danger = false,
  onClick
}: {
  label: string
  title: string
  icon: React.ReactNode
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        'h-7 shrink-0 px-2 text-[11px]',
        danger ? 'text-muted-foreground hover:text-destructive' : ''
      )}
      title={title}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {icon}
      {label}
    </Button>
  )
}

async function resolveNodeImageSource(node: CanvasNodeData): Promise<string | null> {
  if (node.type !== 'image' && node.type !== 'result') return null
  return imageSourceForDisplay(node.metadata.content, node.metadata.storagePath)
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
  if (node.type === 'generate' && node.height < GENERATE_NODE_MIN_DISPLAY_HEIGHT) {
    return { ...node, height: GENERATE_NODE_MIN_DISPLAY_HEIGHT }
  }
  if (!isImageDisplayNode(node)) return node
  const { width, height } = imageNodeDisplayDimensions(node)
  if (width === node.width && height === node.height) return node
  return { ...node, width, height }
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null
}

function renderCanvasProject(nodes: CanvasNodeData[], connections: CanvasConnection[], viewport: CanvasViewport): CanvasProject {
  return {
    id: 'render-canvas-project',
    title: 'Render Canvas Project',
    conversationId: 'render-canvas-conversation',
    schemaVersion: 1,
    nodes,
    connections,
    viewport,
    createdAt: '',
    updatedAt: ''
  }
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
  return {
    x: side === 'source' ? node.position.x + node.width - NODE_HEADER_PADDING_X : node.position.x + NODE_HEADER_PADDING_X,
    y: node.position.y + NODE_HEADER_HEIGHT / 2
  }
}

function sourcePortLabel(node: CanvasNodeData): string | null {
  if (node.type === 'text') return '提示词'
  if (node.type === 'image' || node.type === 'result') return '参考图'
  if (node.type === 'config') return '参数'
  if (node.type === 'batch') return '批量'
  if (node.type === 'generate') return '结果'
  return null
}

function targetPortLabel(fromNode: CanvasNodeData, toNode: CanvasNodeData): string | null {
  const kind = canvasConnectionKindForNodes(fromNode, toNode)
  return kind ? connectionKindLabel(kind) : null
}

function connectionKindLabel(kind: CanvasConnectionKind): string {
  if (kind === 'prompt') return '提示词'
  if (kind === 'reference-image') return '参考图'
  if (kind === 'config') return '参数'
  if (kind === 'batch') return '批量'
  return '结果'
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
