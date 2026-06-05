import { describe, expect, it } from 'vitest'
import type { CanvasConnection, CanvasNodeData, CanvasProject } from '../shared/types'
import { buildCanvasGenerationPlanForNode, buildCanvasWorkflowPlan, MAX_CANVAS_WORKFLOW_REQUESTS } from './canvas-workflow'

function project(nodes: CanvasNodeData[], connections: CanvasConnection[] = []): CanvasProject {
  return {
    id: 'canvas-workflow-test',
    title: 'Canvas 项目',
    conversationId: 'conversation-workflow-test',
    schemaVersion: 1,
    nodes,
    connections,
    viewport: { x: 0, y: 0, k: 1 },
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z'
  }
}

function node(id: string, type: CanvasNodeData['type'], content: string, metadata: Partial<CanvasNodeData['metadata']> = {}): CanvasNodeData {
  return {
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 220,
    height: 140,
    metadata: { content, ...metadata }
  }
}

describe('canvas workflow planning', () => {
  it('combines prompt, config, and the first batch variant for a single node run', () => {
    const text = node('text', 'text', 'connected')
    const config = node('config', 'config', '', { ratio: '16:9', quality: 'high', n: 9 })
    const batch = node('batch', 'batch', 'one\n\ntwo')
    const generate = node('generate', 'generate', 'local')
    const plan = buildCanvasGenerationPlanForNode(project([text, config, batch, generate], [
      { id: 'c1', fromNodeId: text.id, toNodeId: generate.id, kind: 'prompt' },
      { id: 'c2', fromNodeId: config.id, toNodeId: generate.id, kind: 'config' },
      { id: 'c3', fromNodeId: batch.id, toNodeId: generate.id, kind: 'batch' }
    ]), generate.id, 'first')

    expect(plan).toEqual([
      {
        nodeId: generate.id,
        prompt: 'connected\n\nlocal\n\none',
        config: { ratio: '16:9', quality: 'high', n: 4 },
        batchVariant: 'one',
        batchIndex: 0
      }
    ])
  })

  it('expands batch variants for workflow runs and detects request budget overflow', () => {
    const generate = node('generate', 'generate', 'local')
    const batch = node('batch', 'batch', Array.from({ length: MAX_CANVAS_WORKFLOW_REQUESTS + 1 }, (_, index) => `v${index}`).join('\n'))
    const plan = buildCanvasWorkflowPlan(project([batch, generate], [
      { id: 'batch-link', fromNodeId: batch.id, toNodeId: generate.id, kind: 'batch' }
    ]))

    expect(plan.requestCount).toBe(MAX_CANVAS_WORKFLOW_REQUESTS + 1)
    expect(plan.exceedsBudget).toBe(true)
    expect(plan.items[0].prompt).toBe('local\n\nv0')
  })

  it('reports missing prompt and skips running generate nodes', () => {
    const emptyGenerate = node('empty-generate', 'generate', '')
    const runningGenerate = node('running-generate', 'generate', 'busy', { status: 'running' })
    const plan = buildCanvasWorkflowPlan(project([emptyGenerate, runningGenerate]))

    expect(plan.items).toEqual([])
    expect(plan.missingPromptNodeIds).toEqual([emptyGenerate.id])
    expect(plan.skippedRunningNodeIds).toEqual([runningGenerate.id])
  })
})
