import { describe, expect, it, vi } from 'vitest'
import { createCanvasAgentToolRegistry, type CanvasAgentPendingChange, type CanvasAgentToolContext } from './canvas-agent-tools'
import type { CanvasNodeData, CanvasProject } from '../shared/types'

describe('canvas-agent-tools', () => {
  it('creates nodes and focuses the created node', async () => {
    const project = canvasProject()
    const context = toolContext(project)
    const registry = createCanvasAgentToolRegistry(context)

    const result = await registry.execute('create_text_node', {
      content: 'new prompt',
      title: '新提示词'
    })

    expect(result.ok).toBe(true)
    expect(result.focusNodeId).toBeTruthy()
    expect(project.nodes.at(-1)).toMatchObject({
      type: 'text',
      title: '新提示词',
      metadata: { content: 'new prompt' }
    })
    expect(context.focusNode).toHaveBeenCalledWith(result.focusNodeId, { highlight: true })
  })

  it('creates prompt enrichment as a pending change without mutating the node', async () => {
    const project = canvasProject()
    const context = toolContext(project)
    const registry = createCanvasAgentToolRegistry(context)

    const result = await registry.execute('propose_prompt_enrichment', { node_id: 'text-1' })

    expect(result.ok).toBe(true)
    expect(result.pendingChange).toMatchObject({
      type: 'replace-node-content',
      targetNodeId: 'text-1',
      originalContent: 'cinematic city',
      proposedContent: 'cinematic city, rich details'
    })
    expect(project.nodes[0].metadata.content).toBe('cinematic city')
    expect(context.setPendingChange).toHaveBeenCalledWith(result.pendingChange)
  })

  it('resolves readable duplicate node labels passed as tool node_id arguments', async () => {
    const project = canvasProject()
    project.nodes.splice(1, 0, {
      id: 'text-2',
      type: 'text',
      title: '文本节点',
      position: { x: 0, y: 180 },
      width: 220,
      height: 140,
      metadata: { content: 'second prompt' }
    })
    const context = toolContext(project)
    const registry = createCanvasAgentToolRegistry(context)

    const enrichResult = await registry.execute('propose_prompt_enrichment', {
      node_id: '@文本节点 #2 丰富这个节点 并生成一张图 测试'
    })

    expect(enrichResult.ok).toBe(true)
    expect(enrichResult.pendingChange).toMatchObject({
      targetNodeId: 'text-2',
      originalContent: 'second prompt',
      proposedContent: 'second prompt, rich details'
    })
    expect(context.enrichTextPrompt).toHaveBeenCalledWith({ nodeId: 'text-2' })

    const generateResult = await registry.execute('generate_from_text_node', { node_id: '文本节点 #2' })

    expect(generateResult.ok).toBe(true)
    expect(context.createGenerateNodeFromText).toHaveBeenCalledWith('text-2')
    expect(generateResult.data).toMatchObject({ textNodeId: 'text-2', generateNodeId: 'generate-2' })
  })

  it('applies pending changes only when explicitly requested', async () => {
    const project = canvasProject()
    const pending = new Map<string, CanvasAgentPendingChange>()
    const blockedContext = toolContext(project, pending)
    const blockedRegistry = createCanvasAgentToolRegistry(blockedContext)
    const change: CanvasAgentPendingChange = {
      id: 'change-1',
      type: 'replace-node-content',
      targetNodeId: 'text-1',
      targetNodeTitle: '文本节点',
      originalContent: 'cinematic city',
      proposedContent: 'cinematic city, rich details',
      createdAt: '2026-06-07T00:00:00.000Z',
      sourceToolName: 'propose_prompt_enrichment'
    }
    pending.set(change.id, change)

    const blockedResult = await blockedRegistry.execute('apply_pending_change', { change_id: change.id })
    expect(blockedResult.ok).toBe(false)
    expect(blockedResult.message).toContain('需要用户确认')
    expect(project.nodes[0].metadata.content).toBe('cinematic city')
    expect(pending.has(change.id)).toBe(true)

    const context = toolContext(project, pending, { allowConfirmTools: true })
    const registry = createCanvasAgentToolRegistry(context)
    const result = await registry.execute('apply_pending_change', { change_id: change.id })

    expect(result.ok).toBe(true)
    expect(project.nodes[0].metadata.content).toBe('cinematic city, rich details')
    expect(pending.has(change.id)).toBe(false)
  })

  it('returns a tool error for invalid connections instead of mutating canvas', async () => {
    const project = canvasProject()
    const context = toolContext(project)
    const registry = createCanvasAgentToolRegistry(context)

    const result = await registry.execute('connect_nodes', {
      from_node_id: 'generate-1',
      to_node_id: 'text-1'
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('不能建立有效连接')
    expect(project.connections).toHaveLength(1)
  })
})

function toolContext(
  project: CanvasProject,
  pending = new Map<string, CanvasAgentPendingChange>(),
  options: { allowConfirmTools?: boolean } = {}
): CanvasAgentToolContext {
  return {
    getProject: () => project,
    createNode: vi.fn(async (input) => {
      const node: CanvasNodeData = {
        id: `node-${project.nodes.length + 1}`,
        type: input.type,
        title: input.title || (input.type === 'generate' ? '生成节点' : '文本节点'),
        position: { x: 0, y: 0 },
        width: input.type === 'generate' ? 300 : 220,
        height: input.type === 'generate' ? 340 : 140,
        metadata: { content: input.content || '', ...(input.metadata || {}) }
      }
      project.nodes.push(node)
      return node
    }),
    updateNodeContent: vi.fn(async (nodeId, content) => {
      project.nodes = project.nodes.map((node) => (
        node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node
      ))
    }),
    addConnection: vi.fn(async (fromNodeId, toNodeId) => {
      project.connections.push({ id: `connection-${project.connections.length + 1}`, fromNodeId, toNodeId, kind: 'prompt' })
    }),
    createGenerateNodeFromText: vi.fn(async () => 'generate-2'),
    generateCanvasNode: vi.fn(async () => undefined),
    enrichTextPrompt: vi.fn(async ({ nodeId }) => `${project.nodes.find((node) => node.id === nodeId)?.metadata.content || ''}, rich details`),
    focusNode: vi.fn(),
    setPendingChange: vi.fn((change) => pending.set(change.id, change)),
    getPendingChange: vi.fn((id) => pending.get(id) || null),
    clearPendingChange: vi.fn((id) => pending.delete(id)),
    allowConfirmTools: options.allowConfirmTools
  }
}

function canvasProject(): CanvasProject {
  return {
    id: 'project-1',
    title: 'Agent Test Canvas',
    conversationId: 'conversation-1',
    schemaVersion: 1,
    nodes: [
      {
        id: 'text-1',
        type: 'text',
        title: '文本节点',
        position: { x: 0, y: 0 },
        width: 220,
        height: 140,
        metadata: { content: 'cinematic city' }
      },
      {
        id: 'generate-1',
        type: 'generate',
        title: '生成节点',
        position: { x: 260, y: 0 },
        width: 300,
        height: 340,
        metadata: { content: '', status: 'idle' }
      }
    ],
    connections: [
      { id: 'connection-1', fromNodeId: 'text-1', toNodeId: 'generate-1', kind: 'prompt' }
    ],
    assistantMessages: [],
    viewport: { x: 0, y: 0, k: 1 },
    createdAt: '2026-06-07T00:00:00.000Z',
    updatedAt: '2026-06-07T00:00:00.000Z'
  }
}
