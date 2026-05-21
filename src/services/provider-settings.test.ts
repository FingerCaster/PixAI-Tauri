import { describe, expect, it } from 'vitest'
import { getProfileSecret } from '../lib/platform'
import { DEFAULT_PROMPT_MODEL } from '../shared/image-options'
import { ProviderSettingsStore } from './provider-settings'

describe('ProviderSettingsStore', () => {
  it('creates a local OpenAI-compatible default with independent selections', async () => {
    const store = new ProviderSettingsStore()
    const settings = await store.get()

    expect(settings.profiles).toHaveLength(1)
    expect(settings.profiles[0].type).toBe('openai-compatible')
    expect(settings.profiles[0].baseUrl).toBe('http://127.0.0.1:37123')
    expect(settings.selectedImageProfileId).toBe(settings.profiles[0].id)
    expect(settings.selectedPromptProfileId).toBe(settings.profiles[0].id)
  })

  it('stores API keys through the secret boundary instead of profile metadata', async () => {
    const store = new ProviderSettingsStore()
    const settings = await store.upsertProfile({
      name: 'Local mock',
      baseUrl: 'http://127.0.0.1:37123',
      apiKey: 'sk-123456789'
    })
    const profile = settings.profiles.at(-1)

    expect(profile?.apiKeyStored).toBe(true)
    expect(JSON.stringify(profile)).not.toContain('sk-123456789')
    await expect(getProfileSecret(profile?.id || '')).resolves.toMatchObject({ value: 'sk-123456789' })
  })

  it('preserves an existing API key when editing profile metadata without a new key', async () => {
    const store = new ProviderSettingsStore()
    const settings = await store.upsertProfile({
      name: 'Local mock',
      baseUrl: 'http://127.0.0.1:37123',
      apiKey: 'sk-123456789'
    })
    const profile = settings.profiles.at(-1)

    const updated = await store.upsertProfile({
      id: profile?.id,
      name: 'Renamed mock',
      baseUrl: 'http://127.0.0.1:37124',
      enabledUsages: ['prompt']
    })
    const nextProfile = updated.profiles.find((item) => item.id === profile?.id)

    expect(nextProfile?.name).toBe('Renamed mock')
    expect(nextProfile?.apiKeyStored).toBe(true)
    await expect(getProfileSecret(profile?.id || '')).resolves.toMatchObject({ value: 'sk-123456789' })
  })

  it('migrates the old prompt default model to the current default', async () => {
    const store = new ProviderSettingsStore()
    const settings = await store.upsertProfile({
      name: 'Legacy prompt model',
      defaultPromptModel: 'gpt-4.1-mini'
    })
    const profile = settings.profiles.at(-1)

    expect(profile?.defaultPromptModel).toBe(DEFAULT_PROMPT_MODEL)
    expect(profile?.defaultPromptModel).toBe('gpt-5.4-mini')
  })

  it('allows image and prompt selections to differ', async () => {
    const store = new ProviderSettingsStore()
    const imageSettings = await store.upsertProfile({ name: 'Image only', enabledUsages: ['image'] })
    const imageProfile = imageSettings.profiles.at(-1)
    const promptSettings = await store.upsertProfile({ name: 'Prompt only', enabledUsages: ['prompt'] })
    const promptProfile = promptSettings.profiles.at(-1)

    const settings = await store.update({
      selectedImageProfileId: imageProfile?.id,
      selectedPromptProfileId: promptProfile?.id
    })

    expect(settings.selectedImageProfileId).toBe(imageProfile?.id)
    expect(settings.selectedPromptProfileId).toBe(promptProfile?.id)
  })

  it('rejects incompatible profile selections by falling back to matching usages', async () => {
    const store = new ProviderSettingsStore()
    const imageSettings = await store.upsertProfile({ name: 'Image only', enabledUsages: ['image'] })
    const imageProfile = imageSettings.profiles.at(-1)
    const promptSettings = await store.upsertProfile({ name: 'Prompt only', enabledUsages: ['prompt'] })
    const promptProfile = promptSettings.profiles.at(-1)
    await store.update({ selectedImageProfileId: imageProfile?.id, selectedPromptProfileId: promptProfile?.id })

    const settings = await store.update({
      selectedImageProfileId: promptProfile?.id,
      selectedPromptProfileId: imageProfile?.id
    })

    expect(settings.selectedImageProfileId).toBe(imageProfile?.id)
    expect(settings.selectedPromptProfileId).toBe(promptProfile?.id)
  })

  it('falls back to a usage-compatible profile after deleting a selected profile', async () => {
    const store = new ProviderSettingsStore()
    const imageSettings = await store.upsertProfile({ name: 'Image only', enabledUsages: ['image'] })
    const imageProfile = imageSettings.profiles.at(-1)
    const promptSettings = await store.upsertProfile({ name: 'Prompt only', enabledUsages: ['prompt'] })
    const promptProfile = promptSettings.profiles.at(-1)
    await store.update({ selectedImageProfileId: imageProfile?.id, selectedPromptProfileId: promptProfile?.id })

    const settings = await store.deleteProfile(promptProfile?.id || '')

    expect(settings.selectedImageProfileId).toBe(imageProfile?.id)
    expect(settings.selectedPromptProfileId).toBe('default-openai-compatible')
  })
})
