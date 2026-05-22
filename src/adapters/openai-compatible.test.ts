import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openAiCompatibleAdapter } from './openai-compatible'
import type { ProviderRuntimeProfile } from './types'

const profile: ProviderRuntimeProfile = {
  id: 'profile-1',
  name: 'Local mock',
  type: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:37123',
  defaultImageModel: 'gpt-image-1',
  defaultPromptModel: 'gpt-5.4-mini',
  imageGenerationEndpoint: 'images-api',
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

  it('routes responses image-generation profiles through streaming responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(
      [
        'event: response.image_generation_call.partial_image',
        `data: ${JSON.stringify({ type: 'response.image_generation_call.partial_image', partial_image_b64: 'a'.repeat(120) })}`,
        '',
        'event: response.completed',
        'data: {"type":"response.completed"}',
        ''
      ].join('\n'),
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    ))

    const images = await openAiCompatibleAdapter.generateImage({ ...profile, imageGenerationEndpoint: 'responses-api' }, {
      input: {
        conversationId: 'c1',
        prompt: 'test',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1,
        stream: true,
        partialImages: 1
      },
      referenceImages: []
    })

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body || '{}'))
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:37123/v1/responses', expect.objectContaining({ method: 'POST' }))
    expect(body.stream).toBe(true)
    expect(body.tools[0]).toMatchObject({
      type: 'image_generation',
      action: 'generate',
      model: 'gpt-image-1',
      size: '1024x1024',
      quality: 'high',
      partial_images: 1
    })
    expect(images[0].b64_json).toBe('a'.repeat(120))
  })

  it('detects responses image-generation support through stream output', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(
      [
        'event: response.image_generation_call.completed',
        `data: ${JSON.stringify({ type: 'response.image_generation_call.completed', result: 'b'.repeat(120) })}`,
        ''
      ].join('\n'),
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    ))

    const result = await openAiCompatibleAdapter.testConnection({
      ...profile,
      imageGenerationEndpoint: 'responses-api',
      enabledUsages: ['image']
    })

    expect(result.ok).toBe(true)
    expect(result.message).toContain('Responses 图像工具检测成功')
  })

  it('reports connected responses image-generation endpoints with no image output', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(
      [
        'event: response.created',
        'data: {"type":"response.created"}',
        ''
      ].join('\n'),
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    ))

    const result = await openAiCompatibleAdapter.testConnection({
      ...profile,
      imageGenerationEndpoint: 'responses-api',
      enabledUsages: ['image']
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('没有返回图片事件')
  })
})
