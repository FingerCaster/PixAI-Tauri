import { describe, expect, it } from 'vitest'
import type { CanvasConnection, CanvasNodeData, CanvasProject } from '../shared/types'
import { buildCanvasGenerationPlanForNode, buildCanvasWorkflowPlan, MAX_CANVAS_WORKFLOW_REQUESTS, summarizeCanvasGenerationInput } from './canvas-workflow'

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

  it('summarizes prompt, reference image, config, batch, and request context for generate nodes', () => {
    const promptOne = node('prompt-one', 'text', 'connected one')
    const promptTwo = node('prompt-two', 'text', 'connected two')
    const blankPrompt = node('blank-prompt', 'text', '   ')
    const image = node('image-reference', 'image', 'data:image/png;base64,AA==')
    const result = node('result-reference', 'result', '', { referenceImageId: 'reference-from-result' })
    const emptyImage = node('empty-image-reference', 'image', '')
    const config = node('config-node', 'config', '', { ratio: '16:9', quality: 'high', n: 9 })
    const batch = node('batch-node', 'batch', 'variant one\n\nvariant two')
    const generate = node('generate-node', 'generate', 'local prompt')
    const summary = summarizeCanvasGenerationInput(project([
      promptOne,
      promptTwo,
      blankPrompt,
      image,
      result,
      emptyImage,
      config,
      batch,
      generate
    ], [
      { id: 'prompt-one-link', fromNodeId: promptOne.id, toNodeId: generate.id, kind: 'prompt' },
      { id: 'prompt-two-link', fromNodeId: promptTwo.id, toNodeId: generate.id, kind: 'prompt' },
      { id: 'blank-prompt-link', fromNodeId: blankPrompt.id, toNodeId: generate.id, kind: 'prompt' },
      { id: 'image-link', fromNodeId: image.id, toNodeId: generate.id, kind: 'reference-image' },
      { id: 'result-link', fromNodeId: result.id, toNodeId: generate.id, kind: 'reference-image' },
      { id: 'empty-image-link', fromNodeId: emptyImage.id, toNodeId: generate.id, kind: 'reference-image' },
      { id: 'config-link', fromNodeId: config.id, toNodeId: generate.id, kind: 'config' },
      { id: 'batch-link', fromNodeId: batch.id, toNodeId: generate.id, kind: 'batch' }
    ]), generate.id)

    expect(summary).toEqual({
      promptTextCount: 2,
      localPromptPresent: true,
      referenceImageCount: 2,
      configCount: 1,
      batchVariantCount: 2,
      requestCount: 2,
      missingPrompt: false,
      hasConfig: true,
      config: { ratio: '16:9', quality: 'high', n: 4 }
    })
  })

  it('summarizes missing prompt and invalid nodes without changing workflow semantics', () => {
    const emptyGenerate = node('empty-generate', 'generate', '')
    const text = node('text-node', 'text', 'standalone')
    const emptySummary = summarizeCanvasGenerationInput(project([emptyGenerate, text]), emptyGenerate.id)
    const invalidSummary = summarizeCanvasGenerationInput(project([emptyGenerate, text]), text.id)

    expect(emptySummary).toMatchObject({
      promptTextCount: 0,
      localPromptPresent: false,
      referenceImageCount: 0,
      configCount: 0,
      batchVariantCount: 0,
      requestCount: 1,
      missingPrompt: true,
      hasConfig: false,
      config: {}
    })
    expect(buildCanvasWorkflowPlan(project([emptyGenerate])).missingPromptNodeIds).toEqual([emptyGenerate.id])
    expect(invalidSummary).toMatchObject({
      requestCount: 0,
      missingPrompt: true
    })
  })
})
