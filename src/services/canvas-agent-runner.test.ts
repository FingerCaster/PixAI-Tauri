import { describe, expect, it, vi } from 'vitest'
import { runCanvasAgent } from './canvas-agent-runner'
import type { CanvasAgentPendingChange, CanvasAgentToolContext } from './canvas-agent-tools'
import type { CanvasAgentTurnRequest, CanvasAgentTurnResponse } from '../adapters/types'
import type { CanvasNodeData, CanvasProject } from '../shared/types'

describe('canvas-agent-runner', () => {
  it('runs finite tool loop and returns the final model message', async () => {
    const project = canvasProject()
    const callModel = vi.fn<(request: CanvasAgentTurnRequest) => Promise<CanvasAgentTurnResponse>>()
      .mockResolvedValueOnce({
        content: '我先读取画布。',
        toolCalls: [{ id: 'call-1', name: 'list_canvas_state', arguments: {} }]
      })
      .mockResolvedValueOnce({
        content: '画布里有 2 个节点，我已确认链路。',
        toolCalls: []
      })
    const timelineEvents: string[] = []

    const result = await runCanvasAgent({
      userMessage: '检查画布',
      project,
      history: [],
      toolContext: toolContext(project),
      callModel,
      onTimelineEvent: (event) => {
        timelineEvents.push(`${event.type}:${event.status}:${event.title}`)
      }
    })

    expect(result.assistantMessage).toBe('画布里有 2 个节点，我已确认链路。')
    expect(result.usedFallback).toBe(false)
    expect(result.timeline.some((event) => event.type === 'tool' && event.status === 'succeeded')).toBe(true)
    expect(timelineEvents).toContain('final:succeeded:运行完成')
    expect(callModel).toHaveBeenCalledTimes(2)
    const secondRequest = callModel.mock.calls[1][0]
    expect(secondRequest.messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'call-1',
      name: 'list_canvas_state'
    })
  })

  it('stops when tool call budget is exhausted', async () => {
    const project = canvasProject()
    const callModel = vi.fn<(request: CanvasAgentTurnRequest) => Promise<CanvasAgentTurnResponse>>()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call-1', name: 'list_canvas_state', arguments: {} },
          { id: 'call-2', name: 'inspect_node', arguments: { node_id: 'text-1' } }
        ]
      })

    const result = await runCanvasAgent({
      userMessage: '连续检查',
      project,
      history: [],
      toolContext: toolContext(project),
      callModel,
      maxToolCalls: 1
    })

    expect(result.assistantMessage).toContain('工具调用次数已达到上限 1')
    expect(result.timeline.at(-1)).toMatchObject({
      type: 'final',
      status: 'failed',
      title: '工具预算耗尽'
    })
  })

  it('keeps pending changes from tool results for the UI', async () => {
    const project = canvasProject()
    const callModel = vi.fn<(request: CanvasAgentTurnRequest) => Promise<CanvasAgentTurnResponse>>()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'call-1', name: 'propose_prompt_enrichment', arguments: { node_id: 'text-1' } }]
      })
      .mockResolvedValueOnce({
        content: '已生成候选，请确认是否应用。',
        toolCalls: []
      })

    const result = await runCanvasAgent({
      userMessage: '丰富第一个文本',
      project,
      history: [],
      toolContext: toolContext(project),
      callModel
    })

    expect(project.nodes[0].metadata.content).toBe('cinematic city')
    expect(result.pendingChanges[0]).toMatchObject({
      type: 'replace-node-content',
      targetNodeId: 'text-1',
      proposedContent: 'cinematic city, rich details'
    })
  })
})

function toolContext(project: CanvasProject, pending = new Map<string, CanvasAgentPendingChange>()): CanvasAgentToolContext {
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
    clearPendingChange: vi.fn((id) => pending.delete(id))
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
