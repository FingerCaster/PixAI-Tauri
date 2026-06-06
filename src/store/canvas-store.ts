import { create } from 'zustand'
import { createId } from '../lib/ids'
import { DEFAULT_CANVAS_VIEWPORT, wouldCreateCanvasConnectionCycle } from '../services/canvas-projects'
import { pixaiApi } from '../services/app-api'
import type { CanvasConnectionKind, CanvasNodeData, CanvasNodeMetadata, CanvasPoint, CanvasProject, CanvasProjectSummary, CanvasViewport } from '../shared/types'

export type CanvasImageNodeInput = {
  name: string
  dataUrl: string
  mimeType: string
  fileSizeBytes: number
  naturalWidth?: number
  naturalHeight?: number
  referenceImageId?: string
  historyItemId?: string
  storagePath?: string | null
}

export type CanvasStoreState = {
  projects: CanvasProjectSummary[]
  activeProjectId: string | null
  activeProject: CanvasProject | null
  loading: boolean
  errorMessage: string | null
  loadProjects: () => Promise<void>
  createProject: (input: { conversationId: string; title?: string }) => Promise<CanvasProject | null>
  deleteProject: (projectId: string) => Promise<void>
  ensureDefaultProject: (conversationId: string) => Promise<CanvasProject | null>
  openProject: (projectId: string) => Promise<CanvasProject | null>
  exportActiveProject: () => Promise<CanvasProject | null>
  importProjectFromJson: (input: unknown, conversationId: string) => Promise<CanvasProject | null>
  updateViewport: (viewport: CanvasViewport) => Promise<void>
  resetViewport: () => Promise<void>
  addTextNode: () => Promise<void>
  addImageNode: (input: CanvasImageNodeInput) => Promise<void>
  addGenerateNode: () => Promise<void>
  addConfigNode: () => Promise<void>
  addBatchNode: () => Promise<void>
  addResultNode: () => Promise<void>
  updateNodeContent: (nodeId: string, content: string) => Promise<void>
  updateNodeMetadata: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => Promise<void>
  updateGenerateNodeState: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => Promise<void>
  bindImageNodeReference: (nodeId: string, referenceImageId: string) => Promise<void>
  moveNode: (nodeId: string, position: CanvasPoint) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
  addConnection: (fromNodeId: string, toNodeId: string) => Promise<void>
  deleteConnection: (connectionId: string) => Promise<void>
  addGeneratedImageNode: (sourceNodeId: string, input: CanvasImageNodeInput) => Promise<void>
  recordGeneratedResult: (sourceNodeId: string, input: CanvasImageNodeInput) => Promise<void>
}

const initialCanvasStoreState = {
  projects: [],
  activeProjectId: null,
  activeProject: null,
  loading: false,
  errorMessage: null
}

let defaultProjectRequest: { conversationId: string; promise: Promise<CanvasProject | null> } | null = null
type CanvasSet = (partial: Partial<CanvasStoreState>) => void
const IMAGE_NODE_WIDTH = 320
const IMAGE_NODE_HEIGHT = 260

export const useCanvasStore = create<CanvasStoreState>((set, get) => ({
  ...initialCanvasStoreState,
  loadProjects: async () => {
    set({ loading: true, errorMessage: null })
    try {
      const projects = await pixaiApi.canvas.list()
      set({ projects, loading: false })
    } catch (error) {
      set({ loading: false, errorMessage: getCanvasErrorMessage(error) })
    }
  },
  createProject: async (input) => {
    set({ loading: true, errorMessage: null })
    try {
      const project = await pixaiApi.canvas.create(input)
      const projects = await pixaiApi.canvas.list()
      set({
        projects,
        activeProjectId: project.id,
        activeProject: project,
        loading: false
      })
      return project
    } catch (error) {
      set({ loading: false, errorMessage: getCanvasErrorMessage(error) })
      return null
    }
  },
  deleteProject: async (projectId) => {
    set({ loading: true, errorMessage: null })
    try {
      const deletingActiveProject = get().activeProjectId === projectId
      await pixaiApi.canvas.delete(projectId)
      const projects = await pixaiApi.canvas.list()
      if (!deletingActiveProject) {
        set({ projects, loading: false })
        return
      }
      const nextProjectId = projects[0]?.id || null
      const nextProject = nextProjectId ? await pixaiApi.canvas.get(nextProjectId) : null
      set({
        projects,
        activeProjectId: nextProject?.id || null,
        activeProject: nextProject,
        loading: false
      })
    } catch (error) {
      set({ loading: false, errorMessage: getCanvasErrorMessage(error) })
    }
  },
  ensureDefaultProject: async (conversationId) => {
    const normalizedConversationId = conversationId.trim()
    if (!normalizedConversationId) {
      set({ errorMessage: 'Canvas project requires a conversation.' })
      return null
    }
    if (defaultProjectRequest?.conversationId === normalizedConversationId) {
      return defaultProjectRequest.promise
    }
    const currentProject = get().activeProject
    if (currentProject?.conversationId === normalizedConversationId) return currentProject
    const promise = ensureDefaultProjectForConversation(normalizedConversationId, set, get)
    defaultProjectRequest = { conversationId: normalizedConversationId, promise }
    try {
      return await promise
    } finally {
      if (defaultProjectRequest?.promise === promise) defaultProjectRequest = null
    }
  },
  openProject: async (projectId) => {
    set({ loading: true, errorMessage: null })
    try {
      const project = await pixaiApi.canvas.get(projectId)
      const projects = await pixaiApi.canvas.list()
      set({
        projects,
        activeProjectId: project?.id || null,
        activeProject: project,
        loading: false
      })
      return project
    } catch (error) {
      set({ loading: false, errorMessage: getCanvasErrorMessage(error) })
      return null
    }
  },
  exportActiveProject: async () => {
    const project = get().activeProject
    if (!project) return null
    set({ loading: true, errorMessage: null })
    try {
      const exported = await pixaiApi.canvas.exportProject(project.id)
      set({ loading: false })
      return exported
    } catch (error) {
      set({ loading: false, errorMessage: getCanvasErrorMessage(error) })
      return null
    }
  },
  importProjectFromJson: async (input, conversationId) => {
    set({ loading: true, errorMessage: null })
    try {
      const project = await pixaiApi.canvas.importProject(input, conversationId)
      const projects = await pixaiApi.canvas.list()
      set({
        projects,
        activeProjectId: project.id,
        activeProject: project,
        loading: false
      })
      return project
    } catch (error) {
      set({ loading: false, errorMessage: getCanvasErrorMessage(error) })
      return null
    }
  },
  updateViewport: async (viewport) => {
    const project = get().activeProject
    if (!project) return
    const optimisticProject = { ...project, viewport }
    set({ activeProject: optimisticProject, errorMessage: null })
    try {
      const updated = await pixaiApi.canvas.update(project.id, { viewport })
      set({
        activeProject: updated,
        activeProjectId: updated.id,
        projects: updateProjectSummary(get().projects, updated)
      })
    } catch (error) {
      set({ activeProject: project, errorMessage: getCanvasErrorMessage(error) })
    }
  },
  resetViewport: async () => {
    await get().updateViewport({ ...DEFAULT_CANVAS_VIEWPORT })
  },
  addTextNode: async () => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: [...project.nodes, createTextNode(project)]
    }))
  },
  addImageNode: async (input) => {
    if (!input.mimeType.startsWith('image/') || !isCanvasImageSource(input.dataUrl) || input.fileSizeBytes < 0) return
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: findImageNodeBinding(project, input) ? project.nodes : [...project.nodes, createImageNode(project, input)]
    }))
  },
  addGenerateNode: async () => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: [...project.nodes, createGenerateNode(project)]
    }))
  },
  addConfigNode: async () => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: [...project.nodes, createConfigNode(project)]
    }))
  },
  addBatchNode: async () => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: [...project.nodes, createBatchNode(project)]
    }))
  },
  addResultNode: async () => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: [...project.nodes, createResultNode(project)]
    }))
  },
  updateNodeContent: async (nodeId, content) => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: project.nodes.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node))
    }))
  },
  updateNodeMetadata: async (nodeId, patch) => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: project.nodes.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...patch } } : node))
    }))
  },
  updateGenerateNodeState: async (nodeId, patch) => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: project.nodes.map((node) => (
        node.id === nodeId && node.type === 'generate'
          ? { ...node, metadata: { ...node.metadata, ...patch } }
          : node
      ))
    }))
  },
  bindImageNodeReference: async (nodeId, referenceImageId) => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: project.nodes.map((node) => (
        node.id === nodeId && (node.type === 'image' || node.type === 'result')
          ? { ...node, metadata: { ...node.metadata, referenceImageId } }
          : node
      ))
    }))
  },
  moveNode: async (nodeId, position) => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: project.nodes.map((node) => (node.id === nodeId ? { ...node, position: normalizePoint(position) } : node))
    }))
  },
  deleteNode: async (nodeId) => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      nodes: project.nodes.filter((node) => node.id !== nodeId),
      connections: project.connections.filter((connection) => connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId)
    }))
  },
  addConnection: async (fromNodeId, toNodeId) => {
    if (fromNodeId === toNodeId) return
    await persistActiveProject(set, get, (project) => {
      const fromNode = project.nodes.find((node) => node.id === fromNodeId)
      const toNode = project.nodes.find((node) => node.id === toNodeId)
      if (!fromNode || !toNode) return project
      const kind = connectionKindForNode(fromNode)
      const exists = project.connections.some(
        (connection) => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId && connection.kind === kind
      )
      if (exists) return project
      if (wouldCreateCanvasConnectionCycle(project.connections, fromNodeId, toNodeId)) return project
      return {
        ...project,
        connections: [...project.connections, { id: createId('canvas-connection'), fromNodeId, toNodeId, kind }]
      }
    })
  },
  deleteConnection: async (connectionId) => {
    await persistActiveProject(set, get, (project) => ({
      ...project,
      connections: project.connections.filter((connection) => connection.id !== connectionId)
    }))
  },
  addGeneratedImageNode: async (sourceNodeId, input) => {
    await get().recordGeneratedResult(sourceNodeId, input)
  },
  recordGeneratedResult: async (sourceNodeId, input) => {
    if (!input.mimeType.startsWith('image/') || !isCanvasImageSource(input.dataUrl) || input.fileSizeBytes < 0) return
    await persistActiveProject(set, get, (project) => {
      const sourceNode = project.nodes.find((node) => node.id === sourceNodeId && node.type === 'generate')
      if (!sourceNode) return project
      const resultNodes = findConnectedResultNodes(project, sourceNodeId)
      const nodesWithSourceState = project.nodes.map((node) => {
        if (node.id === sourceNodeId) {
          return { ...node, metadata: { ...node.metadata, status: 'succeeded' as const, historyItemId: input.historyItemId, errorMessage: '' } }
        }
        if (resultNodes.some((resultNode) => resultNode.id === node.id)) {
          return {
            ...node,
            metadata: {
              ...node.metadata,
              content: input.dataUrl,
              status: 'succeeded' as const,
              historyItemId: input.historyItemId,
              errorMessage: '',
              ...(input.storagePath ? { storagePath: input.storagePath } : {}),
              mimeType: input.mimeType,
              fileSizeBytes: input.fileSizeBytes,
              ...(input.naturalWidth ? { naturalWidth: input.naturalWidth } : {}),
              ...(input.naturalHeight ? { naturalHeight: input.naturalHeight } : {}),
              maskDataUrl: '',
              maskUpdatedAt: ''
            }
          }
        }
        return node
      })
      if (resultNodes.length > 0) {
        return {
          ...project,
          nodes: nodesWithSourceState
        }
      }
      const existingNode = findImageNodeBinding({ ...project, nodes: nodesWithSourceState }, input)
      const imageNode = existingNode || createImageNodeAt(input, nextResultNodePosition(sourceNode, project))
      const nodes = nodesWithSourceState.concat(existingNode ? [] : [imageNode])
      const hasResultConnection = project.connections.some(
        (connection) => connection.fromNodeId === sourceNodeId && connection.toNodeId === imageNode.id && connection.kind === 'result'
      )
      return {
        ...project,
        nodes,
        connections: hasResultConnection
          ? project.connections
          : [...project.connections, { id: createId('canvas-connection'), fromNodeId: sourceNodeId, toNodeId: imageNode.id, kind: 'result' }]
      }
    })
  }
}))

export function resetCanvasStoreForTests(): void {
  defaultProjectRequest = null
  useCanvasStore.setState(initialCanvasStoreState)
}

async function ensureDefaultProjectForConversation(
  conversationId: string,
  set: CanvasSet,
  get: typeof useCanvasStore.getState
): Promise<CanvasProject | null> {
  set({ loading: true, errorMessage: null })
  try {
    let projects = await pixaiApi.canvas.list()
    const currentId = get().activeProjectId
    let project = currentId ? await pixaiApi.canvas.get(currentId) : null
    if (project?.conversationId !== conversationId) project = null
    if (!project && projects.length > 0) {
      project = await findProjectForConversation(projects, conversationId, currentId)
    }
    if (!project) {
      project = await pixaiApi.canvas.create({ conversationId, title: 'Canvas 项目' })
    }
    projects = await pixaiApi.canvas.list()
    set({
      projects,
      activeProjectId: project.id,
      activeProject: project,
      loading: false
    })
    return project
  } catch (error) {
    set({ loading: false, errorMessage: getCanvasErrorMessage(error) })
    return null
  }
}

async function findProjectForConversation(
  projects: CanvasProjectSummary[],
  conversationId: string,
  alreadyFetchedProjectId?: string | null
): Promise<CanvasProject | null> {
  for (const summary of projects) {
    if (summary.id === alreadyFetchedProjectId) continue
    const project = await pixaiApi.canvas.get(summary.id)
    if (project?.conversationId === conversationId) return project
  }
  return null
}

function updateProjectSummary(projects: CanvasProjectSummary[], project: CanvasProject): CanvasProjectSummary[] {
  const summary: CanvasProjectSummary = {
    id: project.id,
    title: project.title,
    conversationId: project.conversationId,
    updatedAt: project.updatedAt,
    nodeCount: project.nodes.length
  }
  const next = projects.some((item) => item.id === project.id)
    ? projects.map((item) => (item.id === project.id ? summary : item))
    : [summary, ...projects]
  return next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

async function persistActiveProject(
  set: CanvasSet,
  get: typeof useCanvasStore.getState,
  mutate: (project: CanvasProject) => CanvasProject
): Promise<void> {
  const project = get().activeProject
  if (!project) return
  const next = mutate(project)
  set({ activeProject: next, activeProjectId: next.id, errorMessage: null })
  try {
    const updated = await pixaiApi.canvas.update(project.id, {
      nodes: next.nodes,
      connections: next.connections,
      viewport: next.viewport
    })
    set({
      activeProject: updated,
      activeProjectId: updated.id,
      projects: updateProjectSummary(get().projects, updated)
    })
  } catch (error) {
    set({ activeProject: project, activeProjectId: project.id, errorMessage: getCanvasErrorMessage(error) })
  }
}

function createTextNode(project: CanvasProject): CanvasNodeData {
  return {
    id: createId('canvas-node'),
    type: 'text',
    title: '文本节点',
    position: nextNodePosition(project),
    width: 220,
    height: 140,
    metadata: { content: '新文本' }
  }
}

function createImageNode(project: CanvasProject, input: CanvasImageNodeInput): CanvasNodeData {
  return createImageNodeAt(input, nextNodePosition(project))
}

function createImageNodeAt(input: CanvasImageNodeInput, position: CanvasPoint): CanvasNodeData {
  return {
    id: createId('canvas-node'),
    type: 'image',
    title: imageNodeTitle(input),
    position,
    width: IMAGE_NODE_WIDTH,
    height: IMAGE_NODE_HEIGHT,
    metadata: {
      content: input.dataUrl,
      ...(input.referenceImageId ? { referenceImageId: input.referenceImageId } : {}),
      ...(input.historyItemId ? { historyItemId: input.historyItemId } : {}),
      ...(input.storagePath ? { storagePath: input.storagePath } : {}),
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      ...(input.naturalWidth ? { naturalWidth: input.naturalWidth } : {}),
      ...(input.naturalHeight ? { naturalHeight: input.naturalHeight } : {})
    }
  }
}

function createGenerateNode(project: CanvasProject): CanvasNodeData {
  return {
    id: createId('canvas-node'),
    type: 'generate',
    title: '生成节点',
    position: nextNodePosition(project),
    width: 300,
    height: 260,
    metadata: {
      content: '',
      status: 'idle'
    }
  }
}

function createConfigNode(project: CanvasProject): CanvasNodeData {
  return {
    id: createId('canvas-node'),
    type: 'config',
    title: '配置节点',
    position: nextNodePosition(project),
    width: 260,
    height: 250,
    metadata: {
      content: ''
    }
  }
}

function createBatchNode(project: CanvasProject): CanvasNodeData {
  return {
    id: createId('canvas-node'),
    type: 'batch',
    title: '批量节点',
    position: nextNodePosition(project),
    width: 260,
    height: 220,
    metadata: {
      content: ''
    }
  }
}

function createResultNode(project: CanvasProject): CanvasNodeData {
  return {
    id: createId('canvas-node'),
    type: 'result',
    title: '结果节点',
    position: nextNodePosition(project),
    width: IMAGE_NODE_WIDTH,
    height: IMAGE_NODE_HEIGHT,
    metadata: {
      content: '',
      status: 'idle'
    }
  }
}

function findImageNodeBinding(project: CanvasProject, input: CanvasImageNodeInput): CanvasNodeData | null {
  return project.nodes.find((node) => {
    if (node.type !== 'image') return false
    if (input.referenceImageId && node.metadata.referenceImageId === input.referenceImageId) return true
    if (input.historyItemId && node.metadata.historyItemId === input.historyItemId) return true
    return false
  }) || null
}

function findConnectedResultNodes(project: CanvasProject, sourceNodeId: string): CanvasNodeData[] {
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]))
  return project.connections
    .filter((connection) => connection.fromNodeId === sourceNodeId && connection.kind === 'result')
    .map((connection) => nodeById.get(connection.toNodeId))
    .filter((node): node is CanvasNodeData => Boolean(node && node.type === 'result'))
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

function nextNodePosition(project: CanvasProject): CanvasPoint {
  const index = project.nodes.length
  const zoom = project.viewport.k || 1
  return {
    x: Math.round(-project.viewport.x / zoom + 96 + (index % 3) * 360),
    y: Math.round(-project.viewport.y / zoom + 96 + Math.floor(index / 3) * 280)
  }
}

function nextResultNodePosition(sourceNode: CanvasNodeData, project?: CanvasProject): CanvasPoint {
  const resultIndex = project?.connections.filter((connection) => connection.fromNodeId === sourceNode.id && connection.kind === 'result').length || 0
  return {
    x: sourceNode.position.x + sourceNode.width + 64,
    y: sourceNode.position.y + resultIndex * 280
  }
}

function normalizePoint(position: CanvasPoint): CanvasPoint {
  return {
    x: Number.isFinite(position.x) ? Math.round(position.x) : 0,
    y: Number.isFinite(position.y) ? Math.round(position.y) : 0
  }
}

function imageNodeTitle(input: CanvasImageNodeInput): string {
  const title = input.name.trim().replace(/\.[^.]+$/, '')
  return title || '图片节点'
}

function connectionKindForNode(node: CanvasNodeData): CanvasConnectionKind {
  if (node.type === 'generate') return 'result'
  if (node.type === 'image' || node.type === 'result') return 'reference-image'
  if (node.type === 'config') return 'config'
  if (node.type === 'batch') return 'batch'
  return 'prompt'
}

function getCanvasErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Canvas project operation failed.'
}
