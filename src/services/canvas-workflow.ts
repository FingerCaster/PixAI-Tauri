import type { CanvasNodeData, CanvasProject, ImageQuality, ImageRatio } from '../shared/types'

export const MAX_CANVAS_WORKFLOW_REQUESTS = 8

export type CanvasWorkflowBatchMode = 'first' | 'all'

export type CanvasGenerationConfigPatch = {
  ratio?: ImageRatio
  quality?: ImageQuality
  n?: number
}

export type CanvasGenerationPlanItem = {
  nodeId: string
  prompt: string
  config: CanvasGenerationConfigPatch
  batchVariant?: string
  batchIndex?: number
}

export type CanvasWorkflowPlan = {
  items: CanvasGenerationPlanItem[]
  skippedRunningNodeIds: string[]
  missingPromptNodeIds: string[]
  requestCount: number
  exceedsBudget: boolean
}

export function buildCanvasGenerationPlanForNode(
  project: CanvasProject,
  nodeId: string,
  batchMode: CanvasWorkflowBatchMode = 'first'
): CanvasGenerationPlanItem[] {
  const node = project.nodes.find((item) => item.id === nodeId)
  if (!node || node.type !== 'generate') return []
  const basePrompt = resolveBasePrompt(project, node)
  const variants = resolveBatchVariants(project, node.id)
  const selectedVariants = batchMode === 'all' ? variants : variants.slice(0, 1)
  if (selectedVariants.length === 0) {
    return [{
      nodeId: node.id,
      prompt: basePrompt,
      config: resolveConfigPatch(project, node.id)
    }]
  }
  return selectedVariants.map((variant, index) => ({
    nodeId: node.id,
    prompt: joinPromptParts([basePrompt, variant]),
    config: resolveConfigPatch(project, node.id),
    batchVariant: variant,
    batchIndex: index
  }))
}

export function buildCanvasWorkflowPlan(project: CanvasProject): CanvasWorkflowPlan {
  const items: CanvasGenerationPlanItem[] = []
  const skippedRunningNodeIds: string[] = []
  const missingPromptNodeIds: string[] = []
  for (const node of project.nodes) {
    if (node.type !== 'generate') continue
    if (node.metadata.status === 'running') {
      skippedRunningNodeIds.push(node.id)
      continue
    }
    const nodeItems = buildCanvasGenerationPlanForNode(project, node.id, 'all')
    const runnableItems = nodeItems.filter((item) => item.prompt.trim())
    if (runnableItems.length === 0) {
      missingPromptNodeIds.push(node.id)
      continue
    }
    items.push(...runnableItems)
  }
  return {
    items,
    skippedRunningNodeIds,
    missingPromptNodeIds,
    requestCount: items.length,
    exceedsBudget: items.length > MAX_CANVAS_WORKFLOW_REQUESTS
  }
}

function resolveBasePrompt(project: CanvasProject, generateNode: CanvasNodeData): string {
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]))
  const connectedPrompts = project.connections
    .filter((connection) => connection.toNodeId === generateNode.id && connection.kind === 'prompt')
    .map((connection) => nodeById.get(connection.fromNodeId))
    .filter((node): node is CanvasNodeData => Boolean(node && node.type === 'text'))
    .map((node) => node.metadata.content.trim())
    .filter(Boolean)
  return joinPromptParts([...connectedPrompts, generateNode.metadata.content])
}

function resolveBatchVariants(project: CanvasProject, generateNodeId: string): string[] {
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]))
  return project.connections
    .filter((connection) => connection.toNodeId === generateNodeId && connection.kind === 'batch')
    .map((connection) => nodeById.get(connection.fromNodeId))
    .filter((node): node is CanvasNodeData => Boolean(node && node.type === 'batch'))
    .flatMap((node) => node.metadata.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
}

function resolveConfigPatch(project: CanvasProject, generateNodeId: string): CanvasGenerationConfigPatch {
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]))
  return project.connections
    .filter((connection) => connection.toNodeId === generateNodeId && connection.kind === 'config')
    .map((connection) => nodeById.get(connection.fromNodeId))
    .filter((node): node is CanvasNodeData => Boolean(node && node.type === 'config'))
    .reduce<CanvasGenerationConfigPatch>((patch, node) => ({
      ...patch,
      ...(node.metadata.ratio ? { ratio: node.metadata.ratio } : {}),
      ...(node.metadata.quality ? { quality: node.metadata.quality } : {}),
      ...(node.metadata.n ? { n: Math.max(1, Math.min(4, node.metadata.n)) } : {})
    }), {})
}

function joinPromptParts(parts: Array<string | undefined>): string {
  return parts.map((part) => (part || '').trim()).filter(Boolean).join('\n\n')
}
