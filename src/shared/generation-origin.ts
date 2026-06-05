import type { GenerationOrigin } from './types'

export function normalizeGenerationOrigin(value: unknown): GenerationOrigin | undefined {
  if (!isRecord(value)) return undefined
  if (value.kind === 'workspace') return { kind: 'workspace' }
  if (value.kind !== 'canvas') return undefined
  const canvasProjectId = stringValue(value.canvasProjectId)
  const canvasNodeId = stringValue(value.canvasNodeId)
  if (!canvasProjectId || !canvasNodeId) return undefined
  return { kind: 'canvas', canvasProjectId, canvasNodeId }
}

export function isCanvasGenerationOrigin(origin: GenerationOrigin | null | undefined): origin is Extract<GenerationOrigin, { kind: 'canvas' }> {
  return origin?.kind === 'canvas'
}

export function generationOriginLabel(origin: GenerationOrigin | null | undefined): string | null {
  if (origin?.kind === 'canvas') return 'Canvas'
  if (origin?.kind === 'workspace') return '工作台'
  return null
}

export function generationOriginSearchText(origin: GenerationOrigin | null | undefined): string {
  if (origin?.kind === 'canvas') return `canvas 画布 ${origin.canvasProjectId} ${origin.canvasNodeId}`
  if (origin?.kind === 'workspace') return 'workspace 工作台'
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
