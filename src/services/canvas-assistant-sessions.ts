import {
  appendCanvasAssistantMessages,
  clearCanvasAssistantMessages,
  deleteProjectCanvasAssistantMessages,
  listCanvasAssistantMessages
} from '../lib/platform'
import { nowIso } from '../lib/time'
import type {
  CanvasAssistantMessage,
  CanvasAssistantSessionMessage,
  CanvasAssistantSessionPage,
  CanvasProject
} from '../shared/types'

export const CANVAS_ASSISTANT_MESSAGES_PAGE_SIZE = 50
const MAX_CANVAS_ASSISTANT_MESSAGE_LENGTH = 20_000
const MAX_CANVAS_ASSISTANT_MESSAGE_ID_LENGTH = 160

export class CanvasAssistantSessionService {
  async list(
    projectId: string,
    options: { limit?: number; before?: string | null } = {}
  ): Promise<CanvasAssistantSessionPage> {
    const normalizedProjectId = projectId.trim()
    if (!normalizedProjectId) return { messages: [], total: 0, hasMore: false }
    const page = await listCanvasAssistantMessages(normalizedProjectId, {
      limit: normalizePageSize(options.limit),
      before: options.before || null
    })
    return {
      messages: page.messages.map(normalizeSessionMessage).filter((message): message is CanvasAssistantSessionMessage => Boolean(message)),
      total: Number.isFinite(page.total) ? Math.max(0, Math.trunc(page.total)) : 0,
      hasMore: Boolean(page.hasMore)
    }
  }

  async append(projectId: string, messages: CanvasAssistantMessage[]): Promise<CanvasAssistantSessionMessage[]> {
    const normalizedProjectId = projectId.trim()
    if (!normalizedProjectId) return []
    const normalizedMessages = normalizeMessagesForProject(normalizedProjectId, messages)
    if (normalizedMessages.length === 0) return []
    await appendCanvasAssistantMessages(normalizedMessages)
    return normalizedMessages
  }

  async clear(projectId: string): Promise<void> {
    const normalizedProjectId = projectId.trim()
    if (!normalizedProjectId) return
    await clearCanvasAssistantMessages(normalizedProjectId)
  }

  async deleteProject(projectId: string): Promise<void> {
    const normalizedProjectId = projectId.trim()
    if (!normalizedProjectId) return
    await deleteProjectCanvasAssistantMessages(normalizedProjectId)
  }

  async migrateProjectMessages(project: CanvasProject | null): Promise<CanvasProject | null> {
    if (!project) return null
    const legacyMessages = normalizeMessagesForProject(project.id, project.assistantMessages || [])
    if (legacyMessages.length === 0) return project
    await appendCanvasAssistantMessages(legacyMessages)
    return { ...project, assistantMessages: [] }
  }
}

function normalizeMessagesForProject(projectId: string, messages: CanvasAssistantMessage[]): CanvasAssistantSessionMessage[] {
  if (!Array.isArray(messages)) return []
  const baseTime = Date.now()
  return messages
    .map((message, index) => normalizeMessageForProject(projectId, message, baseTime + index))
    .filter((message): message is CanvasAssistantSessionMessage => Boolean(message))
}

function normalizeMessageForProject(
  projectId: string,
  message: CanvasAssistantMessage,
  fallbackTime: number
): CanvasAssistantSessionMessage | null {
  if (!message || typeof message !== 'object') return null
  const id = stringValue(message.id).slice(0, MAX_CANVAS_ASSISTANT_MESSAGE_ID_LENGTH)
  const role = message.role === 'assistant' || message.role === 'user' ? message.role : null
  const content = stringValue(message.content).slice(0, MAX_CANVAS_ASSISTANT_MESSAGE_LENGTH)
  if (!id || !role || !content) return null
  return {
    id,
    projectId,
    role,
    content,
    createdAt: normalizeCreatedAt(message.createdAt, fallbackTime)
  }
}

function normalizeSessionMessage(message: CanvasAssistantSessionMessage): CanvasAssistantSessionMessage | null {
  return normalizeMessageForProject(message.projectId, message, Date.now())
}

function normalizePageSize(value: number | undefined): number {
  if (!Number.isFinite(value)) return CANVAS_ASSISTANT_MESSAGES_PAGE_SIZE
  return Math.max(1, Math.min(100, Math.trunc(Number(value))))
}

function normalizeCreatedAt(value: string | undefined, fallbackTime: number): string {
  const parsed = value ? Date.parse(value) : Number.NaN
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  const fallback = new Date(fallbackTime)
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString()
  return nowIso()
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
