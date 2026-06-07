import { create } from 'zustand'
import { createId } from '../lib/ids'
import { CANVAS_ASSISTANT_MESSAGES_PAGE_SIZE } from '../services/canvas-assistant-sessions'
import { DEFAULT_CANVAS_VIEWPORT, canvasConnectionKindForNodes, wouldCreateCanvasConnectionCycle } from '../services/canvas-projects'
import { pixaiApi } from '../services/app-api'
import type { CanvasAssistantMessage, CanvasNodeData, CanvasNodeMetadata, CanvasNodeType, CanvasPoint, CanvasProject, CanvasProjectSummary, CanvasViewport } from '../shared/types'

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
  requestIndex?: number
  batchRootId?: string
  batchRunId?: string
  batchIndex?: number
  promptVariant?: string
}

export type CanvasFailedResultInput = {
  errorMessage: string
  runId?: string
  historyItemId?: string
  requestIndex?: number
  batchRootId?: string
  batchRunId?: string
  batchIndex?: number
  promptVariant?: string
}

export type CanvasConnectedNodeInput = {
  sourceNodeId: string
  type: CanvasNodeType
  position: CanvasPoint
}

export type CanvasNodeCreateInput = {
  type: CanvasNodeType
  content?: string
  title?: string
  metadata?: Partial<CanvasNodeMetadata>
}

export type CanvasStoreState = {
  projects: CanvasProjectSummary[]
  activeProjectId: string | null
  activeProject: CanvasProject | null
  assistantMessages: CanvasAssistantMessage[]
  assistantMessagesHasMore: boolean
  assistantMessagesLoading: boolean
  assistantMessagesTotal: number
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
  loadAssistantMessages: (projectId?: string) => Promise<void>
  loadMoreAssistantMessages: () => Promise<void>
  appendAssistantMessages: (messages: CanvasAssistantMessage[]) => Promise<void>
  clearAssistantMessages: () => Promise<void>
  updateAssistantMessages: (messages: CanvasAssistantMessage[]) => Promise<void>
  resetViewport: () => Promise<void>
  addTextNode: () => Promise<void>
  addImageNode: (input: CanvasImageNodeInput) => Promise<void>
  addGenerateNode: () => Promise<void>
  addConfigNode: () => Promise<void>
  addBatchNode: () => Promise<void>
  addResultNode: () => Promise<void>
  createNode: (input: CanvasNodeCreateInput) => Promise<CanvasNodeData | null>
  createGenerateNodeFromText: (textNodeId: string) => Promise<string | null>
  addConnectedNode: (input: CanvasConnectedNodeInput) => Promise<CanvasNodeData | null>
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
  recordFailedResult: (sourceNodeId: string, input: CanvasFailedResultInput) => Promise<void>
}

const initialCanvasStoreState = {
  projects: [],
  activeProjectId: null,
  activeProject: null,
  assistantMessages: [],
  assistantMessagesHasMore: false,
  assistantMessagesLoading: false,
  assistantMessagesTotal: 0,
  loading: false,
  errorMessage: null
}

let defaultProjectRequest: { conversationId: string; promise: Promise<CanvasProject | null> } | null = null
type CanvasSet = (partial: Partial<CanvasStoreState>) => void
type CanvasGet = () => CanvasStoreState
const IMAGE_NODE_WIDTH = 320
const IMAGE_NODE_HEIGHT = 260
const GENERATE_NODE_HEIGHT = 340
const AUTO_NODE_ORIGIN_OFFSET = 96
const AUTO_NODE_GAP_X = 64
const AUTO_NODE_GAP_Y = 64
const AUTO_NODE_COLLISION_PADDING = 24
const AUTO_NODE_MAX_COLUMNS = 12
const AUTO_NODE_MAX_ROWS = 40

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
      return await activateCanvasProject(project, projects, set)
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
      let cleanupError: unknown = null
      try {
        await pixaiApi.canvasAssistant.deleteProject(projectId)
      } catch (error) {
        cleanupError = error
      }
      const projects = await pixaiApi.canvas.list()
      if (!deletingActiveProject) {
        set({ projects, loading: false, errorMessage: cleanupError ? getCanvasErrorMessage(cleanupError) : null })
        return
      }
      const nextProjectId = projects[0]?.id || null
      const nextProject = nextProjectId ? await pixaiApi.canvas.get(nextProjectId) : null
      await activateCanvasProject(nextProject, projects, set, cleanupError ? getCanvasErrorMessage(cleanupError) : null)
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
      return await activateCanvasProject(project, projects, set)
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
      return await activateCanvasProject(project, projects, set)
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
  loadAssistantMessages: async (projectId) => {
    const targetProjectId = (projectId || get().activeProjectId || get().activeProject?.id || '').trim()
    if (!targetProjectId) {
      set({
        assistantMessages: [],
        assistantMessagesHasMore: false,
        assistantMessagesLoading: false,
        assistantMessagesTotal: 0
      })
      return
    }
    set({ assistantMessagesLoading: true, errorMessage: null })
    try {
      const page = await pixaiApi.canvasAssistant.list(targetProjectId, { limit: CANVAS_ASSISTANT_MESSAGES_PAGE_SIZE })
      if (get().activeProjectId !== targetProjectId) {
        set({ assistantMessagesLoading: false })
        return
      }
      set({
        assistantMessages: page.messages,
        assistantMessagesHasMore: page.hasMore,
        assistantMessagesLoading: false,
        assistantMessagesTotal: page.total
      })
    } catch (error) {
      set({ assistantMessagesLoading: false, errorMessage: getCanvasErrorMessage(error) })
    }
  },
  loadMoreAssistantMessages: async () => {
    const projectId = get().activeProjectId || get().activeProject?.id
    const before = get().assistantMessages[0]?.id
    if (!projectId || !before || get().assistantMessagesLoading || !get().assistantMessagesHasMore) return
    set({ assistantMessagesLoading: true, errorMessage: null })
    try {
      const page = await pixaiApi.canvasAssistant.list(projectId, {
        limit: CANVAS_ASSISTANT_MESSAGES_PAGE_SIZE,
        before
      })
      if (get().activeProjectId !== projectId) {
        set({ assistantMessagesLoading: false })
        return
      }
      set({
        assistantMessages: mergeAssistantMessages(page.messages, get().assistantMessages),
        assistantMessagesHasMore: page.hasMore,
        assistantMessagesLoading: false,
        assistantMessagesTotal: page.total
      })
    } catch (error) {
      set({ assistantMessagesLoading: false, errorMessage: getCanvasErrorMessage(error) })
    }
  },
  appendAssistantMessages: async (messages) => {
    const project = get().activeProject
    if (!project || messages.length === 0) return
    set({ errorMessage: null })
    try {
      const appended = await pixaiApi.canvasAssistant.append(project.id, messages)
      if (appended.length === 0 || get().activeProjectId !== project.id) return
      const currentMessages = get().assistantMessages
      const nextMessages = mergeAssistantMessages(currentMessages, appended)
      const currentIds = new Set(currentMessages.map((message) => message.id))
      const appendedIds = new Set(appended.filter((message) => !currentIds.has(message.id)).map((message) => message.id))
      set({
        assistantMessages: nextMessages,
        assistantMessagesTotal: Math.max(nextMessages.length, get().assistantMessagesTotal + appendedIds.size)
      })
    } catch (error) {
      set({ errorMessage: getCanvasErrorMessage(error) })
    }
  },
  clearAssistantMessages: async () => {
    const project = get().activeProject
    if (!project) return
    set({ assistantMessagesLoading: true, errorMessage: null })
    try {
      await pixaiApi.canvasAssistant.clear(project.id)
      if (get().activeProjectId !== project.id) {
        set({ assistantMessagesLoading: false })
        return
      }
      set({
        assistantMessages: [],
        assistantMessagesHasMore: false,
        assistantMessagesLoading: false,
        assistantMessagesTotal: 0
      })
    } catch (error) {
      set({ assistantMessagesLoading: false, errorMessage: getCanvasErrorMessage(error) })
    }
  },
  updateAssistantMessages: async (messages) => {
    const project = get().activeProject
    if (!project) return
    set({ assistantMessagesLoading: true, errorMessage: null })
    try {
      await pixaiApi.canvasAssistant.clear(project.id)
      await pixaiApi.canvasAssistant.append(project.id, messages)
      const page = await pixaiApi.canvasAssistant.list(project.id, { limit: CANVAS_ASSISTANT_MESSAGES_PAGE_SIZE })
      if (get().activeProjectId !== project.id) {
        set({ assistantMessagesLoading: false })
        return
      }
      set({
        assistantMessages: page.messages,
        assistantMessagesHasMore: page.hasMore,
        assistantMessagesLoading: false,
        assistantMessagesTotal: page.total
      })
    } catch (error) {
      set({ assistantMessagesLoading: false, errorMessage: getCanvasErrorMessage(error) })
    }
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
  createNode: async (input) => {
    let createdNode: CanvasNodeData | null = null
    const persisted = await persistActiveProject(set, get, (project) => {
      const node = createBlankCanvasNodeAt(input.type, nextNodePosition(project, canvasNodeSizeForType(input.type)))
      if (!node || node.type === 'image') return project
      createdNode = {
        ...node,
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        metadata: {
          ...node.metadata,
          ...(input.content !== undefined ? { content: input.content } : {}),
          ...(input.metadata || {})
        }
      }
      return {
        ...project,
        nodes: [...project.nodes, createdNode]
      }
    })
    if (!persisted || !createdNode) return null
    return get().activeProject?.nodes.find((node) => node.id === createdNode?.id) || createdNode
  },
  createGenerateNodeFromText: async (textNodeId) => {
    let generatedNodeId: string | null = null
    const persisted = await persistActiveProject(set, get, (project) => {
      const textNode = project.nodes.find((node) => node.id === textNodeId && node.type === 'text')
      if (!textNode || !textNode.metadata.content.trim()) return project
      const generateNode = createGenerateNodeAt({
        x: textNode.position.x + textNode.width + 72,
        y: textNode.position.y
      })
      generatedNodeId = generateNode.id
      return {
        ...project,
        nodes: [...project.nodes, generateNode],
        connections: [
          ...project.connections,
          { id: createId('canvas-connection'), fromNodeId: textNode.id, toNodeId: generateNode.id, kind: 'prompt' }
        ]
      }
    })
    return persisted ? generatedNodeId : null
  },
  addConnectedNode: async (input) => {
    let connectedNode: CanvasNodeData | null = null
    const persisted = await persistActiveProject(set, get, (project) => {
      const sourceNode = project.nodes.find((node) => node.id === input.sourceNodeId)
      if (!sourceNode) return project
      const targetNode = createBlankCanvasNodeAt(input.type, normalizePoint(input.position))
      if (!targetNode) return project
      const kind = canvasConnectionKindForNodes(sourceNode, targetNode)
      if (!kind) return project
      const exists = project.connections.some(
        (connection) => connection.fromNodeId === sourceNode.id && connection.toNodeId === targetNode.id && connection.kind === kind
      )
      if (exists) return project
      if (wouldCreateCanvasConnectionCycle(project.connections, sourceNode.id, targetNode.id)) return project
      connectedNode = targetNode
      return {
        ...project,
        nodes: [...project.nodes, targetNode],
        connections: [
          ...project.connections,
          { id: createId('canvas-connection'), fromNodeId: sourceNode.id, toNodeId: targetNode.id, kind }
        ]
      }
    })
    return persisted ? connectedNode : null
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
      const kind = canvasConnectionKindForNodes(fromNode, toNode)
      if (!kind) return project
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
      const connectedResultNodes = findConnectedResultNodes(project, sourceNodeId)
      const existingResultNode = findResultNodeBinding(project, input)
      const targetResultNode = existingResultNode || findWritableConnectedResultNode(connectedResultNodes, input)
      const resultNode = targetResultNode || createGeneratedResultNodeAt(input, nextResultNodePosition(sourceNode, project))
      const resultNodeExists = project.nodes.some((node) => node.id === resultNode.id)
      const requestIndex = validCanvasResultIndex(input.requestIndex)
      const nodes = project.nodes.map((node) => {
        if (node.id === sourceNodeId) {
          return {
            ...node,
            metadata: {
              ...node.metadata,
              status: 'succeeded' as const,
              ...(input.historyItemId ? { historyItemId: input.historyItemId } : {}),
              ...(requestIndex != null ? { requestIndex } : {}),
              errorMessage: ''
            }
          }
        }
        if (node.id === resultNode.id) {
          return {
            ...node,
            title: resultNodeTitle(input),
            metadata: generatedResultMetadata(node.metadata, input)
          }
        }
        return node
      })
      const hasResultConnection = project.connections.some(
        (connection) => connection.fromNodeId === sourceNodeId && connection.toNodeId === resultNode.id && connection.kind === 'result'
      )
      return {
        ...project,
        nodes: resultNodeExists ? nodes : nodes.concat(resultNode),
        connections: hasResultConnection
          ? project.connections
          : [...project.connections, { id: createId('canvas-connection'), fromNodeId: sourceNodeId, toNodeId: resultNode.id, kind: 'result' }]
      }
    })
  },
  recordFailedResult: async (sourceNodeId, input) => {
    await persistActiveProject(set, get, (project) => {
      const sourceNode = project.nodes.find((node) => node.id === sourceNodeId && node.type === 'generate')
      if (!sourceNode) return project
      const connectedResultNodes = findConnectedResultNodes(project, sourceNodeId)
      const existingResultNode = findFailedResultNodeBinding(project, sourceNodeId, input)
      const targetResultNode = existingResultNode || findWritableConnectedResultNode(connectedResultNodes, input)
      const resultNode = targetResultNode || createFailedResultNodeAt(input, nextResultNodePosition(sourceNode, project))
      const resultNodeExists = project.nodes.some((node) => node.id === resultNode.id)
      const requestIndex = validCanvasResultIndex(input.requestIndex)
      const nodes = project.nodes.map((node) => {
        if (node.id === sourceNodeId) {
          return {
            ...node,
            metadata: {
              ...node.metadata,
              status: 'failed' as const,
              ...(input.runId ? { runId: input.runId } : {}),
              ...(requestIndex != null ? { requestIndex } : {}),
              errorMessage: input.errorMessage
            }
          }
        }
        if (node.id === resultNode.id) {
          return {
            ...node,
            title: failedResultNodeTitle(input),
            metadata: failedResultMetadata(node.metadata, input)
          }
        }
        return node
      })
      const hasResultConnection = project.connections.some(
        (connection) => connection.fromNodeId === sourceNodeId && connection.toNodeId === resultNode.id && connection.kind === 'result'
      )
      return {
        ...project,
        nodes: resultNodeExists ? nodes : nodes.concat(resultNode),
        connections: hasResultConnection
          ? project.connections
          : [...project.connections, { id: createId('canvas-connection'), fromNodeId: sourceNodeId, toNodeId: resultNode.id, kind: 'result' }]
      }
    })
  }
}))

export function resetCanvasStoreForTests(): void {
  defaultProjectRequest = null
  useCanvasStore.setState(initialCanvasStoreState)
}

async function activateCanvasProject(
  project: CanvasProject | null,
  projects: CanvasProjectSummary[],
  set: CanvasSet,
  errorMessage: string | null = null
): Promise<CanvasProject | null> {
  if (!project) {
    set({
      projects,
      activeProjectId: null,
      activeProject: null,
      assistantMessages: [],
      assistantMessagesHasMore: false,
      assistantMessagesLoading: false,
      assistantMessagesTotal: 0,
      loading: false,
      errorMessage
    })
    return null
  }

  let nextProject = project
  let nextErrorMessage = errorMessage
  if ((project.assistantMessages || []).length > 0) {
    try {
      nextProject = await pixaiApi.canvasAssistant.migrateProjectMessages(project) || project
      nextProject = await pixaiApi.canvas.update(project.id, { assistantMessages: [] })
    } catch (error) {
      nextProject = { ...project, assistantMessages: [] }
      nextErrorMessage = getCanvasErrorMessage(error)
    }
  }

  const page = await pixaiApi.canvasAssistant.list(nextProject.id, {
    limit: CANVAS_ASSISTANT_MESSAGES_PAGE_SIZE
  })
  set({
    projects: updateProjectSummary(projects, nextProject),
    activeProjectId: nextProject.id,
    activeProject: nextProject,
    assistantMessages: page.messages,
    assistantMessagesHasMore: page.hasMore,
    assistantMessagesLoading: false,
    assistantMessagesTotal: page.total,
    loading: false,
    errorMessage: nextErrorMessage
  })
  return nextProject
}

async function ensureDefaultProjectForConversation(
  conversationId: string,
  set: CanvasSet,
  get: CanvasGet
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
    return await activateCanvasProject(project, projects, set)
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

function mergeAssistantMessages(...groups: CanvasAssistantMessage[][]): CanvasAssistantMessage[] {
  const messagesById = new Map<string, CanvasAssistantMessage>()
  for (const messages of groups) {
    for (const message of messages) {
      if (!message?.id) continue
      messagesById.set(message.id, message)
    }
  }
  return [...messagesById.values()].sort(compareAssistantMessages)
}

function compareAssistantMessages(left: CanvasAssistantMessage, right: CanvasAssistantMessage): number {
  const leftTime = assistantMessageTime(left)
  const rightTime = assistantMessageTime(right)
  if (leftTime !== rightTime) return leftTime - rightTime
  return left.id.localeCompare(right.id)
}

function assistantMessageTime(message: CanvasAssistantMessage): number {
  const parsed = message.createdAt ? Date.parse(message.createdAt) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

async function persistActiveProject(
  set: CanvasSet,
  get: CanvasGet,
  mutate: (project: CanvasProject) => CanvasProject
): Promise<boolean> {
  const project = get().activeProject
  if (!project) return false
  const next = mutate(project)
  if (next === project) return false
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
    return true
  } catch (error) {
    set({ activeProject: project, activeProjectId: project.id, errorMessage: getCanvasErrorMessage(error) })
    return false
  }
}

function createTextNode(project: CanvasProject): CanvasNodeData {
  const size = canvasNodeSizeForType('text')
  return {
    id: createId('canvas-node'),
    type: 'text',
    title: '文本节点',
    position: nextNodePosition(project, size),
    width: size.width,
    height: size.height,
    metadata: { content: '新文本' }
  }
}

function createImageNode(project: CanvasProject, input: CanvasImageNodeInput): CanvasNodeData {
  return createImageNodeAt(input, nextNodePosition(project, canvasNodeSizeForType('image')))
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

function createGeneratedResultNodeAt(input: CanvasImageNodeInput, position: CanvasPoint): CanvasNodeData {
  return {
    id: createId('canvas-node'),
    type: 'result',
    title: resultNodeTitle(input),
    position,
    width: IMAGE_NODE_WIDTH,
    height: IMAGE_NODE_HEIGHT,
    metadata: generatedResultMetadata({}, input)
  }
}

function createFailedResultNodeAt(input: CanvasFailedResultInput, position: CanvasPoint): CanvasNodeData {
  return {
    id: createId('canvas-node'),
    type: 'result',
    title: failedResultNodeTitle(input),
    position,
    width: IMAGE_NODE_WIDTH,
    height: IMAGE_NODE_HEIGHT,
    metadata: failedResultMetadata({}, input)
  }
}

function createGenerateNode(project: CanvasProject): CanvasNodeData {
  return createGenerateNodeAt(nextNodePosition(project, canvasNodeSizeForType('generate')))
}

function createGenerateNodeAt(position: CanvasPoint): CanvasNodeData {
  return {
    id: createId('canvas-node'),
    type: 'generate',
    title: '生成节点',
    position,
    width: 300,
    height: GENERATE_NODE_HEIGHT,
    metadata: {
      content: '',
      status: 'idle'
    }
  }
}

function createConfigNode(project: CanvasProject): CanvasNodeData {
  const size = canvasNodeSizeForType('config')
  return {
    id: createId('canvas-node'),
    type: 'config',
    title: '配置节点',
    position: nextNodePosition(project, size),
    width: size.width,
    height: size.height,
    metadata: {
      content: ''
    }
  }
}

function createBatchNode(project: CanvasProject): CanvasNodeData {
  const size = canvasNodeSizeForType('batch')
  return {
    id: createId('canvas-node'),
    type: 'batch',
    title: '批量节点',
    position: nextNodePosition(project, size),
    width: size.width,
    height: size.height,
    metadata: {
      content: ''
    }
  }
}

function createResultNode(project: CanvasProject): CanvasNodeData {
  return createResultNodeAt(nextNodePosition(project, canvasNodeSizeForType('result')))
}

function createResultNodeAt(position: CanvasPoint): CanvasNodeData {
  return {
    id: createId('canvas-node'),
    type: 'result',
    title: '结果节点',
    position,
    width: IMAGE_NODE_WIDTH,
    height: IMAGE_NODE_HEIGHT,
    metadata: {
      content: '',
      status: 'idle'
    }
  }
}

function createBlankCanvasNodeAt(type: CanvasNodeType, position: CanvasPoint): CanvasNodeData | null {
  if (type === 'generate') return createGenerateNodeAt(position)
  if (type === 'result') return createResultNodeAt(position)
  if (type === 'text') {
    return {
      id: createId('canvas-node'),
      type: 'text',
      title: '文本节点',
      position,
      width: 220,
      height: 140,
      metadata: { content: '新文本' }
    }
  }
  if (type === 'config') {
    return {
      id: createId('canvas-node'),
      type: 'config',
      title: '配置节点',
      position,
      width: 260,
      height: 250,
      metadata: { content: '' }
    }
  }
  if (type === 'batch') {
    return {
      id: createId('canvas-node'),
      type: 'batch',
      title: '批量节点',
      position,
      width: 260,
      height: 220,
      metadata: { content: '' }
    }
  }
  return null
}

function findImageNodeBinding(project: CanvasProject, input: CanvasImageNodeInput): CanvasNodeData | null {
  return project.nodes.find((node) => {
    if (node.type !== 'image') return false
    if (input.referenceImageId && node.metadata.referenceImageId === input.referenceImageId) return true
    if (input.historyItemId && node.metadata.historyItemId === input.historyItemId) return true
    return false
  }) || null
}

function findResultNodeBinding(project: CanvasProject, input: CanvasImageNodeInput): CanvasNodeData | null {
  return project.nodes.find((node) => (
    node.type === 'result' && Boolean(input.historyItemId) && node.metadata.historyItemId === input.historyItemId
  )) || null
}

function findFailedResultNodeBinding(project: CanvasProject, sourceNodeId: string, input: CanvasFailedResultInput): CanvasNodeData | null {
  const connectedIds = new Set(
    project.connections
      .filter((connection) => connection.fromNodeId === sourceNodeId && connection.kind === 'result')
      .map((connection) => connection.toNodeId)
  )
  const requestIndex = validCanvasResultIndex(input.requestIndex)
  const batchIndex = validCanvasResultIndex(input.batchIndex)
  return project.nodes.find((node) => {
    if (node.type !== 'result' || !connectedIds.has(node.id)) return false
    if (input.historyItemId && node.metadata.historyItemId === input.historyItemId) return true
    if (node.metadata.status !== 'failed') return false
    const sameRequest = validCanvasResultIndex(node.metadata.requestIndex) === requestIndex
    const sameBatch = validCanvasResultIndex(node.metadata.batchIndex) === batchIndex
    const sameBatchRoot = (node.metadata.batchRootId || '') === (input.batchRootId || '')
    const sameBatchRun = (node.metadata.batchRunId || '') === (input.batchRunId || '')
    return sameRequest && sameBatch && sameBatchRoot && sameBatchRun
  }) || null
}

function findWritableConnectedResultNode(resultNodes: CanvasNodeData[], input: { historyItemId?: string }): CanvasNodeData | null {
  if (input.historyItemId) {
    const matchingResultNode = resultNodes.find((node) => node.metadata.historyItemId === input.historyItemId)
    if (matchingResultNode) return matchingResultNode
  }
  return resultNodes.find((node) => (
    !node.metadata.content &&
    !node.metadata.historyItemId &&
    !node.metadata.errorMessage &&
    (!node.metadata.status || node.metadata.status === 'idle')
  )) || null
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

function nextNodePosition(project: CanvasProject, size: { width: number; height: number }): CanvasPoint {
  const zoom = project.viewport.k || 1
  const origin = {
    x: Math.round(-project.viewport.x / zoom + AUTO_NODE_ORIGIN_OFFSET),
    y: Math.round(-project.viewport.y / zoom + AUTO_NODE_ORIGIN_OFFSET)
  }
  const step = {
    x: size.width + AUTO_NODE_GAP_X,
    y: size.height + AUTO_NODE_GAP_Y
  }
  for (let row = 0; row < AUTO_NODE_MAX_ROWS; row += 1) {
    for (let column = 0; column < AUTO_NODE_MAX_COLUMNS; column += 1) {
      const position = {
        x: origin.x + column * step.x,
        y: origin.y + row * step.y
      }
      if (!project.nodes.some((node) => canvasRectsOverlap(position, size, node))) return position
    }
  }
  return {
    x: origin.x,
    y: origin.y + AUTO_NODE_MAX_ROWS * step.y
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

function canvasNodeSizeForType(type: CanvasNodeType): { width: number; height: number } {
  if (type === 'generate') return { width: 300, height: GENERATE_NODE_HEIGHT }
  if (type === 'image' || type === 'result') return { width: IMAGE_NODE_WIDTH, height: IMAGE_NODE_HEIGHT }
  if (type === 'config') return { width: 260, height: 250 }
  if (type === 'batch') return { width: 260, height: 220 }
  return { width: 220, height: 140 }
}

function canvasRectsOverlap(
  position: CanvasPoint,
  size: { width: number; height: number },
  node: CanvasNodeData
): boolean {
  return (
    position.x < node.position.x + node.width + AUTO_NODE_COLLISION_PADDING &&
    position.x + size.width + AUTO_NODE_COLLISION_PADDING > node.position.x &&
    position.y < node.position.y + node.height + AUTO_NODE_COLLISION_PADDING &&
    position.y + size.height + AUTO_NODE_COLLISION_PADDING > node.position.y
  )
}

function imageNodeTitle(input: CanvasImageNodeInput): string {
  const title = input.name.trim().replace(/\.[^.]+$/, '')
  return title || '图片节点'
}

function resultNodeTitle(input: CanvasImageNodeInput): string {
  const requestIndex = validCanvasResultIndex(input.requestIndex)
  const batchIndex = validCanvasResultIndex(input.batchIndex)
  const batchRunLabel = input.batchRunId ? '本批次' : ''
  if (batchIndex != null && requestIndex != null) return `批量 ${batchIndex + 1} · #${requestIndex + 1}`
  if (batchIndex != null) return `批量结果 #${batchIndex + 1}`
  if (batchRunLabel && requestIndex != null) return `${batchRunLabel}结果 #${requestIndex + 1}`
  if (requestIndex != null) return `生成结果 #${requestIndex + 1}`
  const title = imageNodeTitle(input)
  return title === '图片节点' ? '生成结果' : title
}

function failedResultNodeTitle(input: CanvasFailedResultInput): string {
  const requestIndex = validCanvasResultIndex(input.requestIndex)
  const batchIndex = validCanvasResultIndex(input.batchIndex)
  if (batchIndex != null && requestIndex != null) return `批量 ${batchIndex + 1} · #${requestIndex + 1} 失败`
  if (batchIndex != null) return `批量 ${batchIndex + 1} 失败`
  if (requestIndex != null) return `生成结果 #${requestIndex + 1} 失败`
  return '生成失败'
}

function generatedResultMetadata(base: Partial<CanvasNodeMetadata>, input: CanvasImageNodeInput): CanvasNodeMetadata {
  const requestIndex = validCanvasResultIndex(input.requestIndex)
  const batchIndex = validCanvasResultIndex(input.batchIndex)
  return {
    content: input.dataUrl,
    status: 'succeeded',
    ...(base.referenceImageId ? { referenceImageId: base.referenceImageId } : {}),
    ...(input.historyItemId ? { historyItemId: input.historyItemId } : {}),
    ...(input.storagePath ? { storagePath: input.storagePath } : {}),
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    ...(input.naturalWidth ? { naturalWidth: input.naturalWidth } : {}),
    ...(input.naturalHeight ? { naturalHeight: input.naturalHeight } : {}),
    ...(requestIndex != null ? { requestIndex } : {}),
    ...(input.batchRootId?.trim() ? { batchRootId: input.batchRootId.trim() } : {}),
    ...(input.batchRunId?.trim() ? { batchRunId: input.batchRunId.trim() } : {}),
    ...(batchIndex != null ? { batchIndex } : {}),
    ...(input.promptVariant?.trim() ? { promptVariant: input.promptVariant.trim() } : {}),
    maskDataUrl: '',
    maskUpdatedAt: ''
  }
}

function failedResultMetadata(base: Partial<CanvasNodeMetadata>, input: CanvasFailedResultInput): CanvasNodeMetadata {
  const requestIndex = validCanvasResultIndex(input.requestIndex)
  const batchIndex = validCanvasResultIndex(input.batchIndex)
  return {
    content: '',
    status: 'failed',
    ...(base.referenceImageId ? { referenceImageId: base.referenceImageId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.historyItemId ? { historyItemId: input.historyItemId } : {}),
    ...(requestIndex != null ? { requestIndex } : {}),
    ...(input.batchRootId?.trim() ? { batchRootId: input.batchRootId.trim() } : {}),
    ...(input.batchRunId?.trim() ? { batchRunId: input.batchRunId.trim() } : {}),
    ...(batchIndex != null ? { batchIndex } : {}),
    ...(input.promptVariant?.trim() ? { promptVariant: input.promptVariant.trim() } : {}),
    errorMessage: input.errorMessage
  }
}

function validCanvasResultIndex(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null
}

function getCanvasErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Canvas project operation failed.'
}
