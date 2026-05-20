import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openAiCompatibleAdapter } from './openai-compatible'
import type { ProviderRuntimeProfile } from './types'

const profile: ProviderRuntimeProfile = {
  id: 'profile-1',
  name: 'Local mock',
  type: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:37123',
  defaultImageModel: 'gpt-image-1',
  defaultPromptModel: 'gpt-4.1-mini',
  enabledUsages: ['image', 'prompt'],
  capabilities: ['text-to-image', 'image-to-image', 'prompt-assist', 'connection-test'],
  apiKeyStored: true,
  insecureStorage: true,
  apiKey: 'sk-123456789',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

describe('openAiCompatibleAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output_text: 'ok prompt',
            data: [{ b64_json: 'a'.repeat(120) }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    )
  })

  it('routes prompt assistant requests to responses endpoint', async () => {
    await expect(openAiCompatibleAdapter.inspirePrompt(profile)).resolves.toBe('ok prompt')
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:37123/v1/responses', expect.objectContaining({ method: 'POST' }))
  })

  it('routes text-to-image requests to image generations endpoint', async () => {
    await openAiCompatibleAdapter.generateImage(profile, {
      input: {
        conversationId: 'c1',
        prompt: 'test',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1
      },
      referenceImages: []
    })

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:37123/v1/images/generations', expect.objectContaining({ method: 'POST' }))
  })

  it('routes image-to-image requests to image edits endpoint', async () => {
    await openAiCompatibleAdapter.generateImage(profile, {
      input: {
        conversationId: 'c1',
        prompt: 'test',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1,
        referenceImageIds: ['r1']
      },
      referenceImages: [{ name: 'ref.png', mimeType: 'image/png', dataUrl: `data:image/png;base64,${'a'.repeat(120)}` }]
    })

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:37123/v1/images/edits', expect.objectContaining({ method: 'POST' }))
  })
})
