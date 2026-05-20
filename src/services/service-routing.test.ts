import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDatabase } from './app-database'
import { ImageService } from './image-service'
import { PromptService } from './prompt-service'
import { ProviderSettingsStore } from './provider-settings'

describe('service routing', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/v1/responses')) {
          return new Response(JSON.stringify({ output_text: 'routed prompt' }), { status: 200 })
        }
        return new Response(JSON.stringify({ data: [{ b64_json: 'a'.repeat(120) }] }), { status: 200 })
      })
    )
  })

  it('routes image and prompt calls through separately selected provider profiles', async () => {
    const providers = new ProviderSettingsStore()
    const first = await providers.upsertProfile({
      name: 'Image provider',
      baseUrl: 'http://127.0.0.1:37123',
      enabledUsages: ['image'],
      apiKey: 'sk-123456789'
    })
    const imageProfile = first.profiles.at(-1)
    const second = await providers.upsertProfile({
      name: 'Prompt provider',
      baseUrl: 'http://127.0.0.1:37124',
      enabledUsages: ['prompt'],
      apiKey: 'sk-123456789'
    })
    const promptProfile = second.profiles.at(-1)
    await providers.update({ selectedImageProfileId: imageProfile?.id, selectedPromptProfileId: promptProfile?.id })

    const database = new AppDatabase()
    const conversation = await database.createConversation()
    const imageService = new ImageService(database, providers)
    const promptService = new PromptService(providers)

    await imageService.generate({
      conversationId: conversation.id,
      prompt: 'a luminous city',
      ratio: '1:1',
      size: '1024x1024',
      quality: 'high',
      n: 1
    })
    await promptService.inspire()

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:37123/v1/images/generations', expect.anything())
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:37124/v1/responses', expect.anything())
  })

  it('honors auto-save history and failure-detail conversation toggles', async () => {
    const providers = new ProviderSettingsStore()
    const settings = await providers.upsertProfile({
      name: 'Image provider',
      baseUrl: 'http://127.0.0.1:37123',
      enabledUsages: ['image'],
      apiKey: 'sk-123456789'
    })
    const imageProfile = settings.profiles.at(-1)
    await providers.update({ selectedImageProfileId: imageProfile?.id })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }))

    const database = new AppDatabase()
    const conversation = await database.createConversation({ autoSaveHistory: false, keepFailureDetails: false })
    const imageService = new ImageService(database, providers)

    const result = await imageService.generate({
      conversationId: conversation.id,
      prompt: 'a luminous city',
      ratio: '1:1',
      size: '1024x1024',
      quality: 'high',
      n: 1,
      maxRetries: 0
    })
    const history = await database.listHistory()

    expect(result.items[0].errorDetails).toBeNull()
    expect(history).toHaveLength(0)
  })

  it('normalizes incompatible generation sizes to the selected ratio presets', async () => {
    const providers = new ProviderSettingsStore()
    const settings = await providers.upsertProfile({
      name: 'Image provider',
      baseUrl: 'http://127.0.0.1:37123',
      enabledUsages: ['image'],
      apiKey: 'sk-123456789'
    })
    const imageProfile = settings.profiles.at(-1)
    await providers.update({ selectedImageProfileId: imageProfile?.id })

    const database = new AppDatabase()
    const conversation = await database.createConversation()
    const imageService = new ImageService(database, providers)

    await imageService.generate({
      conversationId: conversation.id,
      prompt: 'a wide luminous city',
      ratio: '16:9',
      size: '1024x1024',
      quality: 'high',
      n: 1
    })
    const runs = await database.listRuns(conversation.id)

    expect(runs[0].size).toBe('1792x1008')
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:37123/v1/images/generations',
      expect.objectContaining({
        body: expect.stringContaining('"size":"1792x1008"')
      })
    )
  })
})
