import { afterEach, describe, expect, it, vi } from 'vitest'
import { pixaiApi } from '../services/app-api'
import type { GenerateImageResult, GenerationRun } from '../shared/types'
import { useAppStore } from './app-store'

describe('useAppStore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads settings, templates, and creates an initial conversation', async () => {
    await useAppStore.getState().load()
    const state = useAppStore.getState()

    expect(state.settings?.profiles.length).toBeGreaterThan(0)
    expect(state.templates.length).toBeGreaterThan(0)
    expect(state.conversations).toHaveLength(1)
    expect(state.activeConversationId).toBe(state.conversations[0].id)
  })

  it('does not install or query the Codex Skill during normal app load', async () => {
    const statusSpy = vi.spyOn(pixaiApi.codexSkill, 'status')
    const installSpy = vi.spyOn(pixaiApi.codexSkill, 'install')

    await useAppStore.getState().load()

    expect(statusSpy).not.toHaveBeenCalled()
    expect(installSpy).not.toHaveBeenCalled()
  })

  it('applies prompt templates to the active conversation', async () => {
    await useAppStore.getState().load()
    const template = useAppStore.getState().templates[0]

    await useAppStore.getState().applyPromptTemplate(template)
    const conversation = useAppStore.getState().conversations[0]

    expect(conversation.draftPrompt).toBe(template.prompt)
    expect(conversation.title).toBe(template.title)
  })

  it('shows generation state immediately while image generation is pending', async () => {
    await useAppStore.getState().load()
    await useAppStore.getState().updateActiveConversation({ draftPrompt: '一只发光的玻璃风铃', n: 2 })
    const conversation = useAppStore.getState().conversations[0]
    const run: GenerationRun = {
      id: 'run-pending-test',
      conversationId: conversation.id,
      prompt: conversation.draftPrompt,
      model: conversation.model,
      ratio: conversation.ratio,
      size: conversation.size,
      quality: conversation.quality,
      n: 2,
      status: 'succeeded',
      durationMs: 1200,
      errorMessage: null,
      errorDetails: null,
      maxRetries: 0,
      retryAttempts: {},
      retryFailures: {},
      generationMode: 'text-to-image',
      referenceImages: [],
      createdAt: new Date().toISOString(),
      items: []
    }
    let resolveGenerate: (value: GenerateImageResult) => void = () => undefined
    vi.spyOn(pixaiApi.image, 'generate').mockImplementation(
      () => new Promise((resolve) => {
        resolveGenerate = resolve
      })
    )
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([])

    const generation = useAppStore.getState().generate()

    expect(useAppStore.getState().getConversationGenerationState(conversation.id)).toMatchObject({
      generating: true,
      activeCount: 1
    })

    resolveGenerate({ run, items: [] })
    await generation

    expect(useAppStore.getState().getConversationGenerationState(conversation.id)).toMatchObject({
      generating: false,
      activeCount: 0
    })
  })

  it('shows preflight generation errors as direct toast messages', async () => {
    await useAppStore.getState().load()
    await useAppStore.getState().updateActiveConversation({ draftPrompt: '一座玻璃城市' })
    const conversation = useAppStore.getState().conversations[0]

    await useAppStore.getState().generate()

    expect(useAppStore.getState().toast).toBe('API Key 尚未配置。')
    expect(useAppStore.getState().runsByConversation[conversation.id] || []).toHaveLength(0)
    expect(await pixaiApi.history.list()).toHaveLength(0)
  })
})
