import { createId } from '../lib/ids'
import type { CanvasAssistantMessage } from '../shared/types'

let lastCanvasAssistantMessageTimestamp = 0

export function createCanvasAssistantMessage(
  role: CanvasAssistantMessage['role'],
  content: string
): CanvasAssistantMessage {
  const timestamp = nextCanvasAssistantMessageTimestamp()
  return {
    id: createId('canvas-assistant-message'),
    role,
    content,
    createdAt: new Date(timestamp).toISOString()
  }
}

function nextCanvasAssistantMessageTimestamp(): number {
  const now = Date.now()
  lastCanvasAssistantMessageTimestamp = Math.max(now, lastCanvasAssistantMessageTimestamp + 1)
  return lastCanvasAssistantMessageTimestamp
}

export function resetCanvasAssistantMessageFactoryForTests(): void {
  lastCanvasAssistantMessageTimestamp = 0
}
