import { describe, expect, it } from 'vitest'
import { inspectCanvasGenerationContext, inspectCanvasNode, summarizeCanvasForAgent } from './canvas-agent-context'
import type { CanvasProject } from '../shared/types'

describe('canvas-agent-context', () => {
  it('summarizes canvas state with stable labels and safe previews', () => {
    const project = canvasProject()
    const summary = summarizeCanvasForAgent(project)

    expect(summary).toMatchObject({
      projectId: 'project-1',
      title: 'Agent Test Canvas',
      nodeCount: 3,
      connectionCount: 1
    })
    expect(summary.nodes.map((node) => node.label)).toEqual(['文本节点 #1', '文本节点 #2', '生成节点'])
    expect(summary.nodes[1].contentPreview).toContain('[image-data-url:')
    expect(summary.nodes[1].contentPreview).not.toContain('data:image/png;base64')
  })

  it('inspects node details without returning raw image data urls', () => {
    const inspection = inspectCanvasNode(canvasProject(), 'text-2')

    expect(inspection.node.content).toContain('[image-data-url:')
    expect(inspection.node.content).not.toContain('data:image/png;base64')
    expect(inspection.incomingConnections).toHaveLength(0)
    expect(inspection.outgoingConnections).toHaveLength(0)
  })

  it('inspects generation context for connected prompt nodes', () => {
    const inspection = inspectCanvasGenerationContext(canvasProject(), 'generate-1')

    expect(inspection.ok).toBe(true)
    expect(inspection.summary.promptTextCount).toBe(1)
    expect(inspection.summary.missingPrompt).toBe(false)
    expect(inspection.planItems[0]).toMatchObject({
      nodeId: 'generate-1',
      hasPrompt: true,
      promptPreview: 'cinematic city'
    })
  })
})

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
        id: 'text-2',
        type: 'text',
        title: '文本节点',
        position: { x: 260, y: 0 },
        width: 220,
        height: 140,
        metadata: { content: `data:image/png;base64,${'a'.repeat(240)}` }
      },
      {
        id: 'generate-1',
        type: 'generate',
        title: '生成节点',
        position: { x: 520, y: 0 },
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
