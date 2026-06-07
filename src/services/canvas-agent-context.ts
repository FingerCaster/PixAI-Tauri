import { buildCanvasGenerationPlanForNode, summarizeCanvasGenerationInput } from './canvas-workflow'
import type { CanvasConnection, CanvasConnectionKind, CanvasNodeData, CanvasNodeStatus, CanvasNodeType, CanvasPoint, CanvasProject } from '../shared/types'

const PREVIEW_LIMIT = 180
const DETAIL_LIMIT = 5000

export type CanvasAgentStateSummary = {
  projectId: string
  title: string
  nodeCount: number
  connectionCount: number
  nodes: Array<{
    id: string
    type: CanvasNodeType
    title: string
    label: string
    contentPreview: string
    status?: CanvasNodeStatus
    position: CanvasPoint
  }>
  connections: Array<{
    id: string
    fromNodeId: string
    toNodeId: string
    kind: CanvasConnectionKind
  }>
}

export type CanvasAgentNodeInspection = {
  node: {
    id: string
    type: CanvasNodeType
    title: string
    label: string
    content: string
    contentPreview: string
    status?: CanvasNodeStatus
    position: CanvasPoint
    width: number
    height: number
    metadata: Record<string, unknown>
  }
  incomingConnections: CanvasConnection[]
  outgoingConnections: CanvasConnection[]
}

export type CanvasAgentGenerationInspection = {
  nodeId: string
  ok: boolean
  message: string
  summary: ReturnType<typeof summarizeCanvasGenerationInput>
  planItems: Array<{
    nodeId: string
    promptPreview: string
    hasPrompt: boolean
    config: Record<string, unknown>
    batchVariant?: string
    batchIndex?: number
  }>
}

export function summarizeCanvasForAgent(project: CanvasProject): CanvasAgentStateSummary {
  return {
    projectId: project.id,
    title: project.title,
    nodeCount: project.nodes.length,
    connectionCount: project.connections.length,
    nodes: project.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      title: node.title,
      label: nodeAgentLabel(node, project.nodes),
      contentPreview: contentPreview(node, PREVIEW_LIMIT),
      ...(node.metadata.status ? { status: node.metadata.status } : {}),
      position: { ...node.position }
    })),
    connections: project.connections.map((connection) => ({ ...connection }))
  }
}

export function inspectCanvasNode(project: CanvasProject, nodeId: string): CanvasAgentNodeInspection {
  const node = project.nodes.find((item) => item.id === nodeId)
  if (!node) throw new Error(`未找到节点：${nodeId}`)
  return {
    node: {
      id: node.id,
      type: node.type,
      title: node.title,
      label: nodeAgentLabel(node, project.nodes),
      content: safeContent(node, DETAIL_LIMIT),
      contentPreview: contentPreview(node, PREVIEW_LIMIT),
      ...(node.metadata.status ? { status: node.metadata.status } : {}),
      position: { ...node.position },
      width: node.width,
      height: node.height,
      metadata: sanitizeMetadata(node)
    },
    incomingConnections: project.connections.filter((connection) => connection.toNodeId === node.id).map((connection) => ({ ...connection })),
    outgoingConnections: project.connections.filter((connection) => connection.fromNodeId === node.id).map((connection) => ({ ...connection }))
  }
}

export function inspectCanvasGenerationContext(project: CanvasProject, nodeId: string): CanvasAgentGenerationInspection {
  const node = project.nodes.find((item) => item.id === nodeId)
  if (!node) {
    return {
      nodeId,
      ok: false,
      message: `未找到节点：${nodeId}`,
      summary: summarizeCanvasGenerationInput(project, nodeId),
      planItems: []
    }
  }
  if (node.type !== 'generate') {
    return {
      nodeId,
      ok: false,
      message: '目标节点不是生成节点。',
      summary: summarizeCanvasGenerationInput(project, nodeId),
      planItems: []
    }
  }
  const planItems = buildCanvasGenerationPlanForNode(project, nodeId, 'all')
  return {
    nodeId,
    ok: true,
    message: planItems.some((item) => item.prompt.trim()) ? '生成上下文已就绪。' : '生成节点缺少可用提示词。',
    summary: summarizeCanvasGenerationInput(project, nodeId),
    planItems: planItems.map((item) => ({
      nodeId: item.nodeId,
      promptPreview: truncateText(item.prompt, PREVIEW_LIMIT),
      hasPrompt: Boolean(item.prompt.trim()),
      config: item.config,
      ...(item.batchVariant ? { batchVariant: item.batchVariant } : {}),
      ...(item.batchIndex != null ? { batchIndex: item.batchIndex } : {})
    }))
  }
}

export function nodeAgentLabel(node: CanvasNodeData, nodes: CanvasNodeData[]): string {
  const title = node.title.trim() || nodeTypeLabel(node.type)
  const sameTitleNodes = nodes.filter((item) => normalizeLabel(item.title || nodeTypeLabel(item.type)) === normalizeLabel(title))
  if (sameTitleNodes.length <= 1) return title
  const sameTypeNodes = nodes.filter((item) => item.type === node.type)
  const typeIndex = sameTypeNodes.findIndex((item) => item.id === node.id) + 1
  return `${title} #${Math.max(1, typeIndex)}`
}

function sanitizeMetadata(node: CanvasNodeData): Record<string, unknown> {
  const { content: _content, ...metadata } = node.metadata
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      typeof value === 'string' ? sanitizeMetadataString(value) : value
    ])
  )
}

function sanitizeMetadataString(value: string): string {
  if (value.startsWith('data:image/')) return `[image-data-url:${value.length}]`
  return truncateText(value, DETAIL_LIMIT)
}

function safeContent(node: CanvasNodeData, limit: number): string {
  const content = node.metadata.content || ''
  if (content.startsWith('data:image/')) return `[image-data-url:${content.length}]`
  return truncateText(content, limit)
}

function contentPreview(node: CanvasNodeData, limit: number): string {
  return truncateText(safeContent(node, limit).replace(/\s+/g, ' ').trim(), limit)
}

function truncateText(value: string, limit: number): string {
  const trimmed = value.trim()
  return trimmed.length > limit ? `${trimmed.slice(0, Math.max(0, limit - 3))}...` : trimmed
}

function normalizeLabel(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function nodeTypeLabel(type: CanvasNodeType): string {
  if (type === 'text') return '文本节点'
  if (type === 'generate') return '生成节点'
  if (type === 'config') return '配置节点'
  if (type === 'batch') return '批量节点'
  if (type === 'result') return '结果节点'
  return '图片节点'
}
