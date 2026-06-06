import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pixaiApi } from '../services/app-api'
import type { CanvasProject } from '../shared/types'
import { resetCanvasStoreForTests, useCanvasStore } from './canvas-store'

function canvasProject(input: Partial<CanvasProject> = {}): CanvasProject {
  return {
    id: input.id || 'canvas-store-test',
    title: input.title || 'Canvas 项目',
    conversationId: input.conversationId || 'conversation-store-test',
    schemaVersion: 1,
    nodes: input.nodes || [],
    connections: input.connections || [],
    viewport: input.viewport || { x: 0, y: 0, k: 1 },
    createdAt: input.createdAt || '2026-06-05T00:00:00.000Z',
    updatedAt: input.updatedAt || '2026-06-05T00:00:00.000Z'
  }
}

describe('useCanvasStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetCanvasStoreForTests()
  })

  it('creates a default project when none exists', async () => {
    const project = canvasProject()
    vi.spyOn(pixaiApi.canvas, 'list')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }])
    vi.spyOn(pixaiApi.canvas, 'create').mockResolvedValue(project)

    await expect(useCanvasStore.getState().ensureDefaultProject(project.conversationId)).resolves.toMatchObject({
      id: project.id
    })

    expect(pixaiApi.canvas.create).toHaveBeenCalledWith({ conversationId: project.conversationId, title: 'Canvas 项目' })
    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: project.id,
      activeProject: expect.objectContaining({ id: project.id }),
      loading: false,
      errorMessage: null
    })
  })

  it('deduplicates concurrent default project creation', async () => {
    const project = canvasProject({ id: 'canvas-single-flight' })
    vi.spyOn(pixaiApi.canvas, 'list')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }])
    vi.spyOn(pixaiApi.canvas, 'create').mockResolvedValue(project)

    const [left, right] = await Promise.all([
      useCanvasStore.getState().ensureDefaultProject(project.conversationId),
      useCanvasStore.getState().ensureDefaultProject(project.conversationId)
    ])

    expect(left?.id).toBe(project.id)
    expect(right?.id).toBe(project.id)
    expect(pixaiApi.canvas.create).toHaveBeenCalledTimes(1)
    expect(useCanvasStore.getState().projects).toHaveLength(1)
  })

  it('opens the project bound to the requested conversation instead of reusing another active project', async () => {
    const oldProject = canvasProject({ id: 'canvas-old-conversation', conversationId: 'conversation-old' })
    const targetProject = canvasProject({ id: 'canvas-target-conversation', conversationId: 'conversation-target' })
    useCanvasStore.setState({
      activeProjectId: oldProject.id,
      activeProject: oldProject,
      projects: [{ id: oldProject.id, title: oldProject.title, updatedAt: oldProject.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'list')
      .mockResolvedValueOnce([
        { id: oldProject.id, title: oldProject.title, updatedAt: oldProject.updatedAt, nodeCount: 0 },
        { id: targetProject.id, title: targetProject.title, updatedAt: targetProject.updatedAt, nodeCount: 0 }
      ])
      .mockResolvedValueOnce([
        { id: targetProject.id, title: targetProject.title, updatedAt: targetProject.updatedAt, nodeCount: 0 },
        { id: oldProject.id, title: oldProject.title, updatedAt: oldProject.updatedAt, nodeCount: 0 }
      ])
    vi.spyOn(pixaiApi.canvas, 'get').mockImplementation(async (id) => {
      if (id === oldProject.id) return oldProject
      if (id === targetProject.id) return targetProject
      return null
    })
    const create = vi.spyOn(pixaiApi.canvas, 'create')

    await expect(useCanvasStore.getState().ensureDefaultProject(targetProject.conversationId)).resolves.toMatchObject({
      id: targetProject.id,
      conversationId: targetProject.conversationId
    })

    expect(create).not.toHaveBeenCalled()
    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: targetProject.id,
      activeProject: expect.objectContaining({ conversationId: targetProject.conversationId })
    })
  })

  it('opens a selected canvas project and returns it to the caller', async () => {
    const currentProject = canvasProject({ id: 'canvas-current-project', conversationId: 'conversation-current' })
    const targetProject = canvasProject({
      id: 'canvas-selected-project',
      title: '分镜画布',
      conversationId: 'conversation-selected',
      updatedAt: '2026-06-05T00:08:00.000Z'
    })
    useCanvasStore.setState({
      activeProjectId: currentProject.id,
      activeProject: currentProject,
      projects: [{ id: currentProject.id, title: currentProject.title, conversationId: currentProject.conversationId, updatedAt: currentProject.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'get').mockResolvedValue(targetProject)
    vi.spyOn(pixaiApi.canvas, 'list').mockResolvedValue([
      { id: targetProject.id, title: targetProject.title, conversationId: targetProject.conversationId, updatedAt: targetProject.updatedAt, nodeCount: 0 },
      { id: currentProject.id, title: currentProject.title, conversationId: currentProject.conversationId, updatedAt: currentProject.updatedAt, nodeCount: 0 }
    ])

    await expect(useCanvasStore.getState().openProject(targetProject.id)).resolves.toEqual(targetProject)

    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: targetProject.id,
      activeProject: expect.objectContaining({
        id: targetProject.id,
        conversationId: targetProject.conversationId
      }),
      loading: false,
      errorMessage: null
    })
  })

  it('updates active viewport optimistically and persists the final value', async () => {
    const project = canvasProject()
    const updated = canvasProject({
      viewport: { x: 42, y: -8, k: 1.25 },
      updatedAt: '2026-06-05T00:01:00.000Z'
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockResolvedValue(updated)

    await useCanvasStore.getState().updateViewport(updated.viewport)

    expect(pixaiApi.canvas.update).toHaveBeenCalledWith(project.id, { viewport: updated.viewport })
    expect(useCanvasStore.getState().activeProject?.viewport).toEqual(updated.viewport)
    expect(useCanvasStore.getState().projects[0]).toMatchObject({
      id: project.id,
      updatedAt: updated.updatedAt
    })
  })

  it('exports the active project through the canvas API', async () => {
    const project = canvasProject({ id: 'canvas-export-store' })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    const exportProject = vi.spyOn(pixaiApi.canvas, 'exportProject').mockResolvedValue(project)

    await expect(useCanvasStore.getState().exportActiveProject()).resolves.toEqual(project)

    expect(exportProject).toHaveBeenCalledWith(project.id)
    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: project.id,
      loading: false,
      errorMessage: null
    })
  })

  it('imports a canvas project and switches the active project to the imported clone', async () => {
    const current = canvasProject({ id: 'canvas-before-import' })
    const imported = canvasProject({
      id: 'canvas-after-import',
      title: '外部项目（导入）',
      conversationId: 'conversation-import-target',
      updatedAt: '2026-06-05T00:07:00.000Z'
    })
    useCanvasStore.setState({
      activeProjectId: current.id,
      activeProject: current,
      projects: [{ id: current.id, title: current.title, updatedAt: current.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'importProject').mockResolvedValue(imported)
    vi.spyOn(pixaiApi.canvas, 'list').mockResolvedValue([
      { id: imported.id, title: imported.title, updatedAt: imported.updatedAt, nodeCount: 0 },
      { id: current.id, title: current.title, updatedAt: current.updatedAt, nodeCount: 0 }
    ])

    await expect(useCanvasStore.getState().importProjectFromJson({ title: '外部项目' }, imported.conversationId)).resolves.toEqual(imported)

    expect(pixaiApi.canvas.importProject).toHaveBeenCalledWith({ title: '外部项目' }, imported.conversationId)
    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: imported.id,
      activeProject: expect.objectContaining({ id: imported.id }),
      loading: false,
      errorMessage: null
    })
    expect(useCanvasStore.getState().projects.map((project) => project.id)).toEqual([imported.id, current.id])
  })

  it('keeps the current project when canvas import fails', async () => {
    const current = canvasProject({ id: 'canvas-import-failure-current' })
    useCanvasStore.setState({
      activeProjectId: current.id,
      activeProject: current,
      projects: [{ id: current.id, title: current.title, updatedAt: current.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'importProject').mockRejectedValue(new Error('invalid import'))

    await expect(useCanvasStore.getState().importProjectFromJson({ schemaVersion: 99 }, current.conversationId)).resolves.toBeNull()

    expect(useCanvasStore.getState()).toMatchObject({
      activeProjectId: current.id,
      activeProject: expect.objectContaining({ id: current.id }),
      loading: false,
      errorMessage: 'invalid import'
    })
  })

  it('adds, edits, moves, connects, and deletes canvas nodes', async () => {
    const project = canvasProject()
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:02:00.000Z'
    }))

    await useCanvasStore.getState().addTextNode()
    const textNode = useCanvasStore.getState().activeProject!.nodes[0]
    expect(textNode).toMatchObject({
      type: 'text',
      title: '文本节点',
      position: { x: 96, y: 96 },
      metadata: { content: '新文本' }
    })

    await useCanvasStore.getState().updateNodeContent(textNode.id, 'edited prompt')
    expect(useCanvasStore.getState().activeProject!.nodes[0].metadata.content).toBe('edited prompt')

    await useCanvasStore.getState().moveNode(textNode.id, { x: 12.4, y: 36.6 })
    expect(useCanvasStore.getState().activeProject!.nodes[0].position).toEqual({ x: 12, y: 37 })

    await useCanvasStore.getState().addImageNode({
      name: 'sample.png',
      dataUrl: 'data:image/png;base64,AA==',
      mimeType: 'image/png',
      fileSizeBytes: 2
    })
    const imageNode = useCanvasStore.getState().activeProject!.nodes[1]
    expect(imageNode).toMatchObject({
      type: 'image',
      title: 'sample',
      width: 320,
      height: 260,
      metadata: { mimeType: 'image/png', fileSizeBytes: 2 }
    })

    await useCanvasStore.getState().addConnection(textNode.id, imageNode.id)
    await useCanvasStore.getState().addConnection(textNode.id, imageNode.id)
    expect(useCanvasStore.getState().activeProject!.connections).toHaveLength(1)
    expect(useCanvasStore.getState().activeProject!.connections[0]).toMatchObject({
      fromNodeId: textNode.id,
      toNodeId: imageNode.id,
      kind: 'prompt'
    })

    await useCanvasStore.getState().deleteNode(textNode.id)
    expect(useCanvasStore.getState().activeProject!.nodes.map((node) => node.id)).toEqual([imageNode.id])
    expect(useCanvasStore.getState().activeProject!.connections).toEqual([])
  })

  it('ignores canvas connections that would create cycles', async () => {
    const firstNode = {
      id: 'node-cycle-first',
      type: 'text' as const,
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'first' }
    }
    const secondNode = {
      id: 'node-cycle-second',
      type: 'text' as const,
      title: '文本节点',
      position: { x: 280, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'second' }
    }
    const thirdNode = {
      id: 'node-cycle-third',
      type: 'text' as const,
      title: '文本节点',
      position: { x: 540, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'third' }
    }
    const project = canvasProject({ nodes: [firstNode, secondNode, thirdNode] })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 3 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:02:30.000Z'
    }))

    await useCanvasStore.getState().addConnection(firstNode.id, secondNode.id)
    await useCanvasStore.getState().addConnection(secondNode.id, thirdNode.id)
    await useCanvasStore.getState().addConnection(thirdNode.id, firstNode.id)
    await useCanvasStore.getState().addConnection(secondNode.id, firstNode.id)

    expect(useCanvasStore.getState().activeProject!.connections).toEqual([
      expect.objectContaining({ fromNodeId: firstNode.id, toNodeId: secondNode.id, kind: 'prompt' }),
      expect.objectContaining({ fromNodeId: secondNode.id, toNodeId: thirdNode.id, kind: 'prompt' })
    ])
  })

  it('ignores invalid image payloads and rolls back failed project updates', async () => {
    const project = canvasProject({
      nodes: [
        {
          id: 'node-to-move',
          type: 'text',
          title: '文本节点',
          position: { x: 1, y: 2 },
          width: 220,
          height: 140,
          metadata: { content: 'before' }
        }
      ]
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 1 }]
    })
    const update = vi.spyOn(pixaiApi.canvas, 'update').mockRejectedValue(new Error('disk full'))

    await useCanvasStore.getState().addImageNode({
      name: 'notes.txt',
      dataUrl: 'data:text/plain;base64,AA==',
      mimeType: 'text/plain',
      fileSizeBytes: 2
    })
    expect(update).not.toHaveBeenCalled()
    expect(useCanvasStore.getState().activeProject!.nodes).toHaveLength(1)

    await useCanvasStore.getState().moveNode('node-to-move', { x: 100, y: 120 })

    expect(useCanvasStore.getState().activeProject!.nodes[0].position).toEqual({ x: 1, y: 2 })
    expect(useCanvasStore.getState().errorMessage).toBe('disk full')
  })

  it('stores reference bindings on image nodes and deduplicates repeated sources', async () => {
    const project = canvasProject()
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:03:00.000Z'
    }))

    const input = {
      name: 'ref.png',
      dataUrl: 'browser-memory/references/ref.png',
      mimeType: 'image/png',
      fileSizeBytes: 0,
      referenceImageId: 'reference-store-test',
      historyItemId: 'history-store-test',
      storagePath: 'browser-memory/references/ref.png'
    }
    await useCanvasStore.getState().addImageNode(input)
    await useCanvasStore.getState().addImageNode(input)

    expect(useCanvasStore.getState().activeProject!.nodes).toHaveLength(1)
    expect(useCanvasStore.getState().activeProject!.nodes[0]).toMatchObject({
      type: 'image',
      title: 'ref',
      width: 320,
      height: 260,
      metadata: {
        content: 'browser-memory/references/ref.png',
        referenceImageId: 'reference-store-test',
        historyItemId: 'history-store-test',
        storagePath: 'browser-memory/references/ref.png'
      }
    })
  })

  it('adds generate nodes, updates state, and creates generated result image nodes', async () => {
    const project = canvasProject()
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:04:00.000Z'
    }))

    await useCanvasStore.getState().addGenerateNode()
    const generateNode = useCanvasStore.getState().activeProject!.nodes[0]

    expect(generateNode).toMatchObject({
      type: 'generate',
      title: '生成节点',
      metadata: { status: 'idle' }
    })

    await useCanvasStore.getState().updateGenerateNodeState(generateNode.id, {
      status: 'running',
      runId: 'run-generate-store',
      requestIndex: 0
    })
    await useCanvasStore.getState().addGeneratedImageNode(generateNode.id, {
      name: 'history-result.png',
      dataUrl: 'data:image/png;base64,cmVzdWx0',
      mimeType: 'image/png',
      fileSizeBytes: 6,
      historyItemId: 'history-result'
    })

    const nodes = useCanvasStore.getState().activeProject!.nodes
    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      type: 'generate',
      metadata: {
        status: 'succeeded',
        historyItemId: 'history-result'
      }
    })
    expect(nodes[1]).toMatchObject({
      type: 'image',
      title: 'history-result',
      width: 320,
      height: 260,
      metadata: {
        historyItemId: 'history-result',
        content: 'data:image/png;base64,cmVzdWx0'
      }
    })
    expect(useCanvasStore.getState().activeProject!.connections).toEqual([
      expect.objectContaining({
        fromNodeId: generateNode.id,
        toNodeId: nodes[1].id,
        kind: 'result'
      })
    ])
  })

  it('adds advanced workflow nodes and records generated output into connected result nodes', async () => {
    const project = canvasProject()
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:08:00.000Z'
    }))

    await useCanvasStore.getState().addGenerateNode()
    await useCanvasStore.getState().addConfigNode()
    await useCanvasStore.getState().addBatchNode()
    await useCanvasStore.getState().addResultNode()
    const [generateNode, configNode, batchNode, resultNode] = useCanvasStore.getState().activeProject!.nodes

    expect(configNode).toMatchObject({ type: 'config', title: '配置节点' })
    expect(batchNode).toMatchObject({ type: 'batch', title: '批量节点' })
    expect(resultNode).toMatchObject({ type: 'result', title: '结果节点', metadata: { status: 'idle' } })

    await useCanvasStore.getState().updateNodeMetadata(configNode.id, { ratio: '16:9', quality: 'high', n: 2 })
    expect(useCanvasStore.getState().activeProject!.nodes[1].metadata).toMatchObject({
      ratio: '16:9',
      quality: 'high',
      n: 2
    })

    await useCanvasStore.getState().addConnection(configNode.id, generateNode.id)
    await useCanvasStore.getState().addConnection(batchNode.id, generateNode.id)
    await useCanvasStore.getState().addConnection(generateNode.id, resultNode.id)
    expect(useCanvasStore.getState().activeProject!.connections.map((connection) => connection.kind)).toEqual([
      'config',
      'batch',
      'result'
    ])

    await useCanvasStore.getState().recordGeneratedResult(generateNode.id, {
      name: 'history-result.png',
      dataUrl: 'data:image/png;base64,cmVzdWx0',
      mimeType: 'image/png',
      fileSizeBytes: 6,
      historyItemId: 'history-result',
      storagePath: null
    })

    const nodes = useCanvasStore.getState().activeProject!.nodes
    expect(nodes).toHaveLength(4)
    expect(nodes[0]).toMatchObject({
      type: 'generate',
      metadata: { status: 'succeeded', historyItemId: 'history-result' }
    })
    expect(nodes[3]).toMatchObject({
      type: 'result',
      metadata: {
        content: 'data:image/png;base64,cmVzdWx0',
        status: 'succeeded',
        historyItemId: 'history-result',
        mimeType: 'image/png'
      }
    })
  })
})
