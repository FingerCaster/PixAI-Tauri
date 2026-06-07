import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCanvasAssistantMessage,
  resetCanvasAssistantMessageFactoryForTests
} from './canvas-assistant-messages'

describe('canvas assistant message factory', () => {
  beforeEach(() => {
    vi.useRealTimers()
    resetCanvasAssistantMessageFactoryForTests()
  })

  it('creates distinct ids and strictly increasing timestamps within the same millisecond', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-07T00:00:00.000Z'))

    const first = createCanvasAssistantMessage('user', 'first')
    const second = createCanvasAssistantMessage('assistant', 'second')

    expect(first.id).not.toBe(second.id)
    expect(first.createdAt).toBe('2026-06-07T00:00:00.000Z')
    expect(second.createdAt).toBe('2026-06-07T00:00:00.001Z')
  })

  it('does not collide ids after a factory reset that simulates a page reload', () => {
    const first = createCanvasAssistantMessage('user', 'before reload')

    resetCanvasAssistantMessageFactoryForTests()

    const second = createCanvasAssistantMessage('assistant', 'after reload')

    expect(first.id).not.toBe(second.id)
  })
})
