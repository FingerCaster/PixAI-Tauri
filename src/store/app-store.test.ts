import { afterEach, describe, expect, it, vi } from 'vitest'
import { openAiCompatibleAdapter } from '../adapters/openai-compatible'
import { __getSentNotificationsForTests, __setNotificationPermissionForTests, getProfileSecret } from '../lib/platform'
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

  it('does not send a system notification while the notification setting is disabled', async () => {
    await prepareSuccessfulGeneration()
    useAppStore.getState().setWindowFocused(false)

    await useAppStore.getState().generate()

    expect(__getSentNotificationsForTests()).toHaveLength(0)
  })

  it('does not send a system notification while the app is focused', async () => {
    await prepareSuccessfulGeneration()
    await useAppStore.getState().updatePreferences({ notifyOnImageSuccess: true, notificationPermission: 'granted' })
    useAppStore.getState().setWindowFocused(true)

    await useAppStore.getState().generate()

    expect(__getSentNotificationsForTests()).toHaveLength(0)
  })

  it('sends one completion system notification while unfocused', async () => {
    await prepareSuccessfulGeneration()
    __setNotificationPermissionForTests('granted')
    await useAppStore.getState().updatePreferences({ notifyOnImageSuccess: true, notificationPermission: 'granted' })
    useAppStore.getState().setWindowFocused(false)

    await useAppStore.getState().generate()

    expect(__getSentNotificationsForTests()).toEqual([
      expect.objectContaining({ title: 'PixAI 图片生成完成' })
    ])
  })

  it('keeps the existing completion toast when notification permission is unavailable', async () => {
    await prepareSuccessfulGeneration()
    __setNotificationPermissionForTests('denied')
    await useAppStore.getState().updatePreferences({ notifyOnImageSuccess: true, notificationPermission: 'denied' })
    useAppStore.getState().setWindowFocused(false)

    await useAppStore.getState().generate()

    expect(__getSentNotificationsForTests()).toHaveLength(0)
    expect(useAppStore.getState().toast).toContain('生成完成')
  })

  it('sends a system notification for failed image generation while unfocused', async () => {
    await prepareSuccessfulGeneration()
    __setNotificationPermissionForTests('granted')
    await useAppStore.getState().updatePreferences({ notifyOnImageSuccess: true, notificationPermission: 'granted' })
    useAppStore.getState().setWindowFocused(false)
    vi.mocked(openAiCompatibleAdapter.generateImage).mockRejectedValue(new Error('upstream failed'))

    await useAppStore.getState().generate()

    expect(__getSentNotificationsForTests()).toEqual([
      expect.objectContaining({ title: 'PixAI 图片生成失败' })
    ])
    expect(useAppStore.getState().toast).toContain('生成失败')
  })

  it('deletes multiple history items through the batch API', async () => {
    await useAppStore.getState().load()
    const deleteManySpy = vi.spyOn(pixaiApi.history, 'deleteMany').mockResolvedValue(2)
    const deleteSpy = vi.spyOn(pixaiApi.history, 'delete')
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([])

    await useAppStore.getState().deleteHistoryItems(['history-1', 'history-2'])

    expect(deleteManySpy).toHaveBeenCalledWith(['history-1', 'history-2'])
    expect(deleteSpy).not.toHaveBeenCalled()
  })
})

async function prepareSuccessfulGeneration(): Promise<void> {
  await useAppStore.getState().load()
  const settings = await pixaiApi.settings.upsertProfile({
    id: 'default-openai-compatible',
    apiKey: 'sk-123456789'
  })
  useAppStore.setState({ settings })
  await expect(getProfileSecret(settings.selectedImageProfileId)).resolves.toMatchObject({ value: 'sk-123456789' })
  await useAppStore.getState().updateActiveConversation({ draftPrompt: '一座玻璃城市', n: 2 })
  vi.spyOn(openAiCompatibleAdapter, 'generateImage').mockResolvedValue([
    { b64_json: 'aGVsbG8=' }
  ])
}
