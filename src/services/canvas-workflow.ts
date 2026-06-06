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

export type CanvasGenerationInputSummary = {
  promptTextCount: number
  localPromptPresent: boolean
  referenceImageCount: number
  configCount: number
  batchVariantCount: number
  requestCount: number
  missingPrompt: boolean
  hasConfig: boolean
  config: CanvasGenerationConfigPatch
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

export function summarizeCanvasGenerationInput(project: CanvasProject, nodeId: string): CanvasGenerationInputSummary {
  const node = project.nodes.find((item) => item.id === nodeId)
  if (!node || node.type !== 'generate') return emptyCanvasGenerationInputSummary()

  const promptTexts = resolveConnectedPromptTexts(project, node.id)
  const configNodes = resolveConnectedConfigNodes(project, node.id)
  const batchVariants = resolveBatchVariants(project, node.id)
  const allPlanItems = buildCanvasGenerationPlanForNode(project, node.id, 'all')
  const runnableItemCount = allPlanItems.filter((item) => item.prompt.trim()).length

  return {
    promptTextCount: promptTexts.length,
    localPromptPresent: Boolean(node.metadata.content.trim()),
    referenceImageCount: resolveReferenceImageInputCount(project, node.id),
    configCount: configNodes.length,
    batchVariantCount: batchVariants.length,
    requestCount: allPlanItems.length,
    missingPrompt: runnableItemCount === 0,
    hasConfig: configNodes.length > 0,
    config: resolveConfigPatchFromNodes(configNodes)
  }
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
  return joinPromptParts([...resolveConnectedPromptTexts(project, generateNode.id), generateNode.metadata.content])
}

function resolveConnectedPromptTexts(project: CanvasProject, generateNodeId: string): string[] {
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]))
  return project.connections
    .filter((connection) => connection.toNodeId === generateNodeId && connection.kind === 'prompt')
    .map((connection) => nodeById.get(connection.fromNodeId))
    .filter((node): node is CanvasNodeData => Boolean(node && node.type === 'text'))
    .map((node) => node.metadata.content.trim())
    .filter(Boolean)
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
  return resolveConfigPatchFromNodes(resolveConnectedConfigNodes(project, generateNodeId))
}

function resolveConnectedConfigNodes(project: CanvasProject, generateNodeId: string): CanvasNodeData[] {
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]))
  return project.connections
    .filter((connection) => connection.toNodeId === generateNodeId && connection.kind === 'config')
    .map((connection) => nodeById.get(connection.fromNodeId))
    .filter((node): node is CanvasNodeData => Boolean(node && node.type === 'config'))
}

function resolveConfigPatchFromNodes(nodes: CanvasNodeData[]): CanvasGenerationConfigPatch {
  return nodes
    .reduce<CanvasGenerationConfigPatch>((patch, node) => ({
      ...patch,
      ...(node.metadata.ratio ? { ratio: node.metadata.ratio } : {}),
      ...(node.metadata.quality ? { quality: node.metadata.quality } : {}),
      ...(node.metadata.n ? { n: Math.max(1, Math.min(4, node.metadata.n)) } : {})
    }), {})
}

function resolveReferenceImageInputCount(project: CanvasProject, generateNodeId: string): number {
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]))
  return project.connections
    .filter((connection) => connection.toNodeId === generateNodeId && connection.kind === 'reference-image')
    .map((connection) => nodeById.get(connection.fromNodeId))
    .filter((node): node is CanvasNodeData => Boolean(node && (node.type === 'image' || node.type === 'result')))
    .filter((node) => Boolean(
      node.metadata.content ||
      node.metadata.referenceImageId ||
      node.metadata.historyItemId ||
      node.metadata.storagePath
    ))
    .length
}

function joinPromptParts(parts: Array<string | undefined>): string {
  return parts.map((part) => (part || '').trim()).filter(Boolean).join('\n\n')
}

function emptyCanvasGenerationInputSummary(): CanvasGenerationInputSummary {
  return {
    promptTextCount: 0,
    localPromptPresent: false,
    referenceImageCount: 0,
    configCount: 0,
    batchVariantCount: 0,
    requestCount: 0,
    missingPrompt: true,
    hasConfig: false,
    config: {}
  }
}
