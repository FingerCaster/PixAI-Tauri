import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeJsonState } from '../lib/platform'
import type { CanvasProject } from '../shared/types'
import { CanvasAssistantSessionService } from './canvas-assistant-sessions'

const STATE_NAME = 'pixai-canvas-assistant-sessions'

describe('CanvasAssistantSessionService', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    await writeJsonState(STATE_NAME, JSON.stringify({ messagesByProject: {} }))
  })

  it('stores messages by project with paging, idempotent append, and cleanup', async () => {
    const service = new CanvasAssistantSessionService()
    const messages = Array.from({ length: 55 }, (_, index) => ({
      id: `message-${String(index + 1).padStart(3, '0')}`,
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `消息 ${index + 1}`,
      createdAt: new Date(Date.UTC(2026, 5, 7, 0, 0, index)).toISOString()
    }))

    await service.append('project-a', messages)
    await service.append('project-a', [messages[54]])
    await service.append('project-b', [{ id: 'message-other', role: 'assistant', content: '另一个项目' }])

    const latest = await service.list('project-a')

    expect(latest.total).toBe(55)
    expect(latest.hasMore).toBe(true)
    expect(latest.messages).toHaveLength(50)
    expect(latest.messages[0].id).toBe('message-006')
    expect(latest.messages.at(-1)?.id).toBe('message-055')

    const older = await service.list('project-a', { before: latest.messages[0].id })

    expect(older.total).toBe(55)
    expect(older.hasMore).toBe(false)
    expect(older.messages.map((message) => message.id)).toEqual([
      'message-001',
      'message-002',
      'message-003',
      'message-004',
      'message-005'
    ])

    await service.clear('project-a')

    await expect(service.list('project-a')).resolves.toMatchObject({ messages: [], total: 0, hasMore: false })
    await expect(service.list('project-b')).resolves.toMatchObject({
      total: 1,
      messages: [expect.objectContaining({ id: 'message-other' })]
    })

    await service.deleteProject('project-b')

    await expect(service.list('project-b')).resolves.toMatchObject({ messages: [], total: 0, hasMore: false })
  })

  it('migrates legacy project messages into the session store without duplicates', async () => {
    const service = new CanvasAssistantSessionService()
    const project: CanvasProject = {
      id: 'project-legacy',
      title: '旧画布',
      conversationId: 'conversation-legacy',
      schemaVersion: 1,
      nodes: [],
      connections: [],
      assistantMessages: [
        { id: 'legacy-user', role: 'user', content: '创建文本节点：猫咪', createdAt: '2026-06-07T00:00:00.000Z' },
        { id: 'legacy-assistant', role: 'assistant', content: '已创建文本节点。', createdAt: '2026-06-07T00:00:01.000Z' }
      ],
      viewport: { x: 0, y: 0, k: 1 },
      createdAt: '2026-06-07T00:00:00.000Z',
      updatedAt: '2026-06-07T00:00:00.000Z'
    }

    await expect(service.migrateProjectMessages(project)).resolves.toMatchObject({
      id: project.id,
      assistantMessages: []
    })
    await service.migrateProjectMessages(project)

    const page = await service.list(project.id, { limit: 10 })

    expect(page.total).toBe(2)
    expect(page.messages.map((message) => message.id)).toEqual(['legacy-user', 'legacy-assistant'])
  })

  it('preserves append order when messages share the same createdAt timestamp', async () => {
    const service = new CanvasAssistantSessionService()

    await service.append('project-order', [
      { id: 'message-10', role: 'user', content: 'first', createdAt: '2026-06-07T00:00:00.000Z' },
      { id: 'message-2', role: 'assistant', content: 'second', createdAt: '2026-06-07T00:00:00.000Z' },
      { id: 'message-11', role: 'user', content: 'third', createdAt: '2026-06-07T00:00:00.000Z' }
    ])

    const page = await service.list('project-order', { limit: 10 })

    expect(page.messages.map((message) => message.id)).toEqual(['message-10', 'message-2', 'message-11'])
  })
})
