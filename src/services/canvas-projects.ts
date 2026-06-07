import { createId } from '../lib/ids'
import { readJsonState, writeJsonState } from '../lib/platform'
import { nowIso } from '../lib/time'
import type {
  CanvasConnection,
  CanvasConnectionKind,
  CanvasAssistantMessage,
  CanvasNodeData,
  CanvasNodeMetadata,
  CanvasNodeType,
  CanvasProject,
  CanvasProjectInput,
  CanvasProjectSummary,
  CanvasViewport
} from '../shared/types'

const STATE_NAME = 'pixai-canvas-projects'
const SCHEMA_VERSION = 1
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3
const MIN_NODE_SIZE = 80
const MAX_NODE_SIZE = 640
const DEFAULT_GENERATE_NODE_HEIGHT = 340
const MAX_NODE_TITLE_LENGTH = 80
const MAX_NODE_CONTENT_LENGTH = 500_000
const MAX_ASSISTANT_MESSAGES = 200
const MAX_ASSISTANT_MESSAGE_LENGTH = 20_000

type PersistedCanvasData = {
  projects: CanvasProject[]
}

export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = { x: 0, y: 0, k: 1 }

export class CanvasProjectService {
  private data: PersistedCanvasData | null = null

  async list(): Promise<CanvasProjectSummary[]> {
    await this.load()
    return this.requireData().projects
      .map(toSummary)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async get(id: string): Promise<CanvasProject | null> {
    await this.load()
    const project = this.requireData().projects.find((item) => item.id === id)
    return project ? cloneProject(project) : null
  }

  async exportProject(id: string): Promise<CanvasProject> {
    const project = await this.get(id)
    if (!project) throw new Error('Canvas project not found.')
    return { ...project, assistantMessages: [] }
  }

  async create(input: { conversationId: string; title?: string }): Promise<CanvasProject> {
    await this.load()
    const conversationId = input.conversationId.trim()
    if (!conversationId) throw new Error('Canvas project requires a conversation.')
    const now = nowIso()
    const project: CanvasProject = {
      id: createId('canvas'),
      title: normalizeTitle(input.title) || 'Canvas 项目',
      conversationId,
      schemaVersion: SCHEMA_VERSION,
      nodes: [],
      connections: [],
      assistantMessages: [],
      viewport: { ...DEFAULT_CANVAS_VIEWPORT },
      createdAt: now,
      updatedAt: now
    }
    this.requireData().projects.unshift(project)
    await this.save()
    return cloneProject(project)
  }

  async update(id: string, input: CanvasProjectInput): Promise<CanvasProject> {
    await this.load()
    const data = this.requireData()
    const current = data.projects.find((item) => item.id === id)
    if (!current) throw new Error('Canvas project not found.')
    const conversationId = input.conversationId?.trim()
    if (input.conversationId !== undefined && !conversationId) {
      throw new Error('Canvas project requires a conversation.')
    }
    const nodes = input.nodes ? normalizeCanvasNodes(input.nodes) : current.nodes
    const connections = input.connections
      ? normalizeCanvasConnections(input.connections, nodes)
      : normalizeCanvasConnections(current.connections, nodes)
    const assistantMessages = input.assistantMessages !== undefined
      ? normalizeCanvasAssistantMessages(input.assistantMessages)
      : current.assistantMessages || []
    const next: CanvasProject = {
      ...current,
      ...(conversationId ? { conversationId } : {}),
      ...(input.title !== undefined ? { title: normalizeTitle(input.title) || current.title } : {}),
      ...(input.viewport ? { viewport: normalizeViewport(input.viewport) } : {}),
      nodes,
      connections,
      assistantMessages,
      updatedAt: nowIso()
    }
    data.projects = data.projects.map((project) => (project.id === id ? next : project))
    await this.save()
    return cloneProject(next)
  }

  async importProject(input: unknown, conversationId: string): Promise<CanvasProject> {
    await this.load()
    const normalizedConversationId = conversationId.trim()
    if (!normalizedConversationId) throw new Error('Canvas project requires a conversation.')
    const imported = normalizeImportedProject(input, normalizedConversationId)
    this.requireData().projects.unshift(imported)
    await this.save()
    return cloneProject(imported)
  }

  async delete(id: string): Promise<void> {
    await this.load()
    const data = this.requireData()
    const before = data.projects.length
    data.projects = data.projects.filter((project) => project.id !== id)
    if (data.projects.length !== before) await this.save()
  }

  private async load(): Promise<void> {
    if (this.data) return
    const payload = await readJsonState(STATE_NAME)
    if (payload) {
      try {
        this.data = normalizeCanvasData(JSON.parse(payload))
        return
      } catch (error) {
        console.warn('[PixAI Canvas] Invalid canvas project state; resetting.', error)
      }
    }
    this.data = { projects: [] }
    await this.save()
  }

  private requireData(): PersistedCanvasData {
    if (!this.data) throw new Error('Canvas project data is not loaded.')
    return this.data
  }

  private async save(): Promise<void> {
    await writeJsonState(STATE_NAME, JSON.stringify(this.requireData(), null, 2))
  }
}

export function clampCanvasZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CANVAS_VIEWPORT.k
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(3))))
}

export function normalizeViewport(input: CanvasViewport): CanvasViewport {
  return {
    x: Number.isFinite(input.x) ? Math.round(input.x) : DEFAULT_CANVAS_VIEWPORT.x,
    y: Number.isFinite(input.y) ? Math.round(input.y) : DEFAULT_CANVAS_VIEWPORT.y,
    k: clampCanvasZoom(input.k)
  }
}

export function normalizeCanvasNodes(input: CanvasNodeData[]): CanvasNodeData[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const nodes: CanvasNodeData[] = []
  for (const item of input) {
    const node = normalizeCanvasNode(item)
    if (!node || seen.has(node.id)) continue
    seen.add(node.id)
    nodes.push(node)
  }
  return nodes
}

export function normalizeCanvasConnections(input: CanvasConnection[], nodes: CanvasNodeData[]): CanvasConnection[] {
  if (!Array.isArray(input)) return []
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()
  const connections: CanvasConnection[] = []
  for (const item of input) {
    const connection = normalizeCanvasConnection(item, nodeById)
    if (!connection) continue
    const key = `${connection.fromNodeId}:${connection.toNodeId}:${connection.kind}`
    if (seen.has(key)) continue
    if (wouldCreateCanvasConnectionCycle(connections, connection.fromNodeId, connection.toNodeId)) continue
    seen.add(key)
    connections.push(connection)
  }
  return connections
}

export function canvasConnectionKindForNodes(fromNode: CanvasNodeData, toNode: CanvasNodeData): CanvasConnectionKind | null {
  if (toNode.type === 'generate') {
    if (fromNode.type === 'text') return 'prompt'
    if (fromNode.type === 'image' || fromNode.type === 'result') return 'reference-image'
    if (fromNode.type === 'config') return 'config'
    if (fromNode.type === 'batch') return 'batch'
  }
  if (fromNode.type === 'generate' && toNode.type === 'result') return 'result'
  return null
}

export function wouldCreateCanvasConnectionCycle(
  connections: Array<Pick<CanvasConnection, 'fromNodeId' | 'toNodeId'>>,
  fromNodeId: string,
  toNodeId: string
): boolean {
  if (fromNodeId === toNodeId) return true
  const targetsBySource = new Map<string, string[]>()
  for (const connection of connections) {
    const targets = targetsBySource.get(connection.fromNodeId)
    if (targets) {
      targets.push(connection.toNodeId)
    } else {
      targetsBySource.set(connection.fromNodeId, [connection.toNodeId])
    }
  }
  const visited = new Set<string>()
  const stack = [toNodeId]
  while (stack.length > 0) {
    const currentNodeId = stack.pop()!
    if (currentNodeId === fromNodeId) return true
    if (visited.has(currentNodeId)) continue
    visited.add(currentNodeId)
    const targets = targetsBySource.get(currentNodeId)
    if (targets) stack.push(...targets)
  }
  return false
}

function normalizeCanvasData(input: unknown): PersistedCanvasData {
  if (!isRecord(input)) return { projects: [] }
  const projects = Array.isArray(input.projects) ? input.projects.map(normalizeProject).filter((project): project is CanvasProject => Boolean(project)) : []
  return { projects }
}

function normalizeProject(input: unknown): CanvasProject | null {
  if (!isRecord(input)) return null
  const id = stringValue(input.id)
  const conversationId = stringValue(input.conversationId)
  if (!id || !conversationId) return null
  const now = nowIso()
  const nodes = normalizeCanvasNodes(Array.isArray(input.nodes) ? input.nodes as CanvasNodeData[] : [])
  return {
    id,
    title: normalizeTitle(stringValue(input.title)) || 'Canvas 项目',
    conversationId,
    schemaVersion: SCHEMA_VERSION,
    nodes,
    connections: normalizeCanvasConnections(Array.isArray(input.connections) ? input.connections as CanvasConnection[] : [], nodes),
    assistantMessages: normalizeCanvasAssistantMessages(input.assistantMessages),
    viewport: normalizeViewport(isRecord(input.viewport) ? {
      x: numberValue(input.viewport.x, DEFAULT_CANVAS_VIEWPORT.x),
      y: numberValue(input.viewport.y, DEFAULT_CANVAS_VIEWPORT.y),
      k: numberValue(input.viewport.k, DEFAULT_CANVAS_VIEWPORT.k)
    } : DEFAULT_CANVAS_VIEWPORT),
    createdAt: stringValue(input.createdAt) || now,
    updatedAt: stringValue(input.updatedAt) || now
  }
}

function normalizeImportedProject(input: unknown, conversationId: string): CanvasProject {
  if (!isRecord(input)) throw new Error('Canvas project import file is invalid.')
  if (input.schemaVersion !== undefined && input.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Unsupported Canvas project schema.')
  }
  const now = nowIso()
  const nodes = normalizeImportedCanvasNodes(Array.isArray(input.nodes) ? input.nodes as CanvasNodeData[] : [])
  return {
    id: createId('canvas'),
    title: importedTitle(stringValue(input.title)),
    conversationId,
    schemaVersion: SCHEMA_VERSION,
    nodes,
    connections: normalizeCanvasConnections(Array.isArray(input.connections) ? input.connections as CanvasConnection[] : [], nodes),
    assistantMessages: normalizeCanvasAssistantMessages(input.assistantMessages),
    viewport: normalizeViewport(isRecord(input.viewport) ? {
      x: numberValue(input.viewport.x, DEFAULT_CANVAS_VIEWPORT.x),
      y: numberValue(input.viewport.y, DEFAULT_CANVAS_VIEWPORT.y),
      k: numberValue(input.viewport.k, DEFAULT_CANVAS_VIEWPORT.k)
    } : DEFAULT_CANVAS_VIEWPORT),
    createdAt: now,
    updatedAt: now
  }
}

function normalizeImportedCanvasNodes(input: CanvasNodeData[]): CanvasNodeData[] {
  return normalizeCanvasNodes(input).map((node) => {
    if ((node.type !== 'generate' && node.type !== 'result') || node.metadata.status !== 'running') return node
    const {
      runId: _runId,
      requestIndex: _requestIndex,
      batchRootId: _batchRootId,
      batchRunId: _batchRunId,
      batchIndex: _batchIndex,
      promptVariant: _promptVariant,
      errorMessage: _errorMessage,
      historyItemId: _historyItemId,
      ...metadata
    } = node.metadata
    return {
      ...node,
      metadata: {
        ...metadata,
        status: 'idle'
      }
    }
  })
}

function toSummary(project: CanvasProject): CanvasProjectSummary {
  return {
    id: project.id,
    title: project.title,
    conversationId: project.conversationId,
    updatedAt: project.updatedAt,
    nodeCount: project.nodes.length
  }
}

function cloneProject(project: CanvasProject): CanvasProject {
  return {
    ...project,
    nodes: project.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      metadata: { ...node.metadata }
    })),
    connections: project.connections.map((connection) => ({ ...connection })),
    assistantMessages: (project.assistantMessages || []).map((message) => ({ ...message })),
    viewport: { ...project.viewport }
  }
}

function normalizeCanvasNode(input: unknown): CanvasNodeData | null {
  if (!isRecord(input)) return null
  const id = stringValue(input.id)
  const type = normalizeCanvasNodeType(input.type)
  if (!id || !type) return null
  const metadata = normalizeCanvasNodeMetadata(type, isRecord(input.metadata) ? input.metadata : {})
  if (!metadata) return null
  return {
    id,
    type,
    title: normalizeNodeTitle(stringValue(input.title), type),
    position: normalizePoint(isRecord(input.position) ? input.position : {}),
    width: normalizeNodeSize(numberValue(input.width, defaultNodeWidth(type))),
    height: normalizeNodeSize(numberValue(input.height, defaultNodeHeight(type))),
    metadata
  }
}

function normalizeCanvasConnection(input: unknown, nodeById: Map<string, CanvasNodeData>): CanvasConnection | null {
  if (!isRecord(input)) return null
  const id = stringValue(input.id)
  const fromNodeId = stringValue(input.fromNodeId)
  const toNodeId = stringValue(input.toNodeId)
  const fromNode = nodeById.get(fromNodeId)
  const toNode = nodeById.get(toNodeId)
  if (!id || !fromNode || !toNode || fromNodeId === toNodeId) return null
  const kind = canvasConnectionKindForNodes(fromNode, toNode)
  if (!kind) return null
  return {
    id,
    fromNodeId,
    toNodeId,
    kind
  }
}

function normalizeCanvasNodeType(value: unknown): CanvasNodeType | null {
  return value === 'text'
    || value === 'image'
    || value === 'generate'
    || value === 'config'
    || value === 'batch'
    || value === 'result'
    ? value
    : null
}

function normalizeCanvasNodeMetadata(type: CanvasNodeType, input: Record<string, unknown>): CanvasNodeMetadata | null {
  const content = stringValue(input.content).slice(0, MAX_NODE_CONTENT_LENGTH)
  const status = normalizeCanvasNodeStatus(input.status)
  const ratio = normalizeImageRatio(input.ratio)
  const quality = normalizeImageQuality(input.quality)
  const n = normalizeCanvasRequestCount(input.n)
  if (type === 'image' && !isCanvasImageSource(content)) return null
  if (type === 'result' && content && !isCanvasImageSource(content)) return null
  return {
    content: content || (type === 'text' ? '新文本' : ''),
    ...(status ? { status } : {}),
    ...(ratio ? { ratio } : {}),
    ...(quality ? { quality } : {}),
    ...(n ? { n } : {}),
    ...(stringValue(input.runId) ? { runId: stringValue(input.runId) } : {}),
    ...(Number.isInteger(input.requestIndex) && Number(input.requestIndex) >= 0 ? { requestIndex: Number(input.requestIndex) } : {}),
    ...(stringValue(input.batchRootId) ? { batchRootId: stringValue(input.batchRootId) } : {}),
    ...(stringValue(input.batchRunId) ? { batchRunId: stringValue(input.batchRunId) } : {}),
    ...(Number.isInteger(input.batchIndex) && Number(input.batchIndex) >= 0 ? { batchIndex: Number(input.batchIndex) } : {}),
    ...(stringValue(input.promptVariant) ? { promptVariant: stringValue(input.promptVariant).slice(0, MAX_NODE_CONTENT_LENGTH) } : {}),
    ...(stringValue(input.errorMessage) ? { errorMessage: stringValue(input.errorMessage) } : {}),
    ...(stringValue(input.referenceImageId) ? { referenceImageId: stringValue(input.referenceImageId) } : {}),
    ...(stringValue(input.historyItemId) ? { historyItemId: stringValue(input.historyItemId) } : {}),
    ...(stringValue(input.storagePath) ? { storagePath: stringValue(input.storagePath) } : {}),
    ...(stringValue(input.mimeType) ? { mimeType: stringValue(input.mimeType) } : {}),
    ...(numberValue(input.fileSizeBytes, 0) > 0 ? { fileSizeBytes: Math.round(numberValue(input.fileSizeBytes, 0)) } : {}),
    ...(numberValue(input.naturalWidth, 0) > 0 ? { naturalWidth: Math.round(numberValue(input.naturalWidth, 0)) } : {}),
    ...(numberValue(input.naturalHeight, 0) > 0 ? { naturalHeight: Math.round(numberValue(input.naturalHeight, 0)) } : {}),
    ...(isCanvasMaskSource(stringValue(input.maskDataUrl)) ? { maskDataUrl: stringValue(input.maskDataUrl) } : {}),
    ...(isCanvasMaskSource(stringValue(input.maskDataUrl)) && stringValue(input.maskUpdatedAt) ? { maskUpdatedAt: stringValue(input.maskUpdatedAt) } : {})
  }
}

function normalizeCanvasAssistantMessages(input: unknown): CanvasAssistantMessage[] {
  if (!Array.isArray(input)) return []
  return input
    .map(normalizeCanvasAssistantMessage)
    .filter((message): message is CanvasAssistantMessage => Boolean(message))
    .slice(-MAX_ASSISTANT_MESSAGES)
}

function normalizeCanvasAssistantMessage(input: unknown): CanvasAssistantMessage | null {
  if (!isRecord(input)) return null
  const id = stringValue(input.id).slice(0, 160)
  const role = input.role === 'assistant' || input.role === 'user' ? input.role : null
  const content = stringValue(input.content).slice(0, MAX_ASSISTANT_MESSAGE_LENGTH)
  if (!id || !role || !content) return null
  const createdAt = stringValue(input.createdAt)
  return { id, role, content, ...(createdAt ? { createdAt } : {}) }
}

function normalizeCanvasNodeStatus(value: unknown) {
  return value === 'idle' || value === 'running' || value === 'succeeded' || value === 'failed' ? value : null
}

function normalizeImageRatio(value: unknown) {
  return value === '1:1'
    || value === '3:2'
    || value === '2:3'
    || value === '4:3'
    || value === '3:4'
    || value === '16:9'
    || value === '9:16'
    || value === '21:9'
    || value === '9:21'
    ? value
    : null
}

function normalizeImageQuality(value: unknown) {
  return value === 'auto' || value === 'low' || value === 'medium' || value === 'high' ? value : null
}

function normalizeCanvasRequestCount(value: unknown): number | null {
  if (!Number.isInteger(value)) return null
  return Math.max(1, Math.min(4, Number(value)))
}

function isCanvasImageSource(value: string): boolean {
  if (!value) return false
  return value.startsWith('data:image/')
    || /^https?:\/\//i.test(value)
    || value.startsWith('asset:')
    || value.startsWith('blob:')
    || value.startsWith('browser-memory/')
    || /^[a-z]:[\\/]/i.test(value)
    || value.startsWith('\\\\')
}

function isCanvasMaskSource(value: string): boolean {
  return value.startsWith('data:image/')
}

function normalizePoint(input: Record<string, unknown>) {
  return {
    x: normalizeCoordinate(numberValue(input.x, 0)),
    y: normalizeCoordinate(numberValue(input.y, 0))
  }
}

function normalizeCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.max(-100_000, Math.min(100_000, value)))
}

function normalizeNodeSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_NODE_SIZE
  return Math.round(Math.max(MIN_NODE_SIZE, Math.min(MAX_NODE_SIZE, value)))
}

function normalizeNodeTitle(value: string, type: CanvasNodeType): string {
  return value.slice(0, MAX_NODE_TITLE_LENGTH) || defaultNodeTitle(type)
}

function defaultNodeWidth(type: CanvasNodeType): number {
  if (type === 'generate') return 300
  if (type === 'config' || type === 'batch' || type === 'result') return 260
  return type === 'image' ? 240 : 220
}

function defaultNodeHeight(type: CanvasNodeType): number {
  if (type === 'generate') return DEFAULT_GENERATE_NODE_HEIGHT
  if (type === 'batch' || type === 'result') return 220
  if (type === 'config') return 250
  return type === 'image' ? 180 : 140
}

function defaultNodeTitle(type: CanvasNodeType): string {
  if (type === 'image') return '图片节点'
  if (type === 'generate') return '生成节点'
  if (type === 'config') return '配置节点'
  if (type === 'batch') return '批量节点'
  if (type === 'result') return '结果节点'
  return '文本节点'
}

function normalizeTitle(value: string | undefined): string {
  return value?.trim().slice(0, 80) || ''
}

function importedTitle(value: string): string {
  const suffix = '（导入）'
  const base = (normalizeTitle(value) || 'Canvas 项目').replace(/\s*（导入）$/u, '')
  return `${base.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
