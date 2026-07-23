import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPixaiApi } from './app-api'
import { handleCodexBridgeRequest } from './codex-bridge'
import type { PixaiApi } from './app-api'

function bridgeRequest(path: string, method = 'GET', body?: unknown) {
  return {
    id: `request-${Math.random()}`,
    method,
    path,
    body: body === undefined ? null : JSON.stringify(body),
    headers: {},
    port: 43117
  }
}

describe('codex bridge', () => {
  const bridgeImageBase64 = btoa('bridge-image'.repeat(8))

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/v1/responses')) {
          return new Response(JSON.stringify({ output_text: '桥接提示词' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        }
        return new Response(JSON.stringify({ data: [{ b64_json: bridgeImageBase64 }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      })
    )
  })

  it('returns health information', async () => {
    const response = await handleCodexBridgeRequest(createPixaiApi(), bridgeRequest('/health'))
    const payload = JSON.parse(response.body || '{}')

    expect(response.status).toBe(200)
    expect(payload.bridge).toBe('codex')
    expect(payload.port).toBe(43117)
  })

  it('updates selected profile models through settings compatibility fields', async () => {
    const api = createPixaiApi()
    const response = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/settings', 'PATCH', {
        defaultModel: 'gpt-image-2-fast',
        promptModel: 'gpt-5.4-mini',
        imageGenerationEndpoint: 'responses-api'
      })
    )
    const payload = JSON.parse(response.body || '{}')
    const imageProfile = payload.profiles.find((profile: { id: string }) => profile.id === payload.selectedImageProfileId)
    const promptProfile = payload.profiles.find((profile: { id: string }) => profile.id === payload.selectedPromptProfileId)

    expect(response.status).toBe(200)
    expect(imageProfile.defaultImageModel).toBe('gpt-image-2-fast')
    expect(imageProfile.imageGenerationEndpoint).toBe('responses-api')
    expect(payload.imageGenerationEndpoint).toBe('responses-api')
    expect(promptProfile.defaultPromptModel).toBe('gpt-5.4-mini')
  })

  it('accepts reference-compatible baseURL and apiKey settings fields', async () => {
    const api = createPixaiApi()
    const response = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/settings', 'PATCH', {
        baseURL: 'http://127.0.0.1:37125',
        apiKey: 'sk-123456789',
        defaultModel: 'gpt-image-2',
        promptModel: 'gpt-5.4-mini'
      })
    )
    const payload = JSON.parse(response.body || '{}')
    const imageProfile = payload.imageProfile

    expect(response.status).toBe(200)
    expect(payload.baseURL).toBe('http://127.0.0.1:37125')
    expect(imageProfile.baseUrl).toBe('http://127.0.0.1:37125')
    expect(imageProfile.apiKeyStored).toBe(true)
    expect(payload.defaultModel).toBe('gpt-image-2')
    expect(payload.promptModel).toBe('gpt-5.4-mini')
  })

  it('generates images through the existing image service and exposes history file bytes', async () => {
    const api = createPixaiApi()
    await configureImageProvider(api)

    const generateResponse = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/generate', 'POST', {
        prompt: '桥接生成测试',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1
      })
    )
    const generated = JSON.parse(generateResponse.body || '{}')
    const historyId = generated.items[0].id
    const fileResponse = await handleCodexBridgeRequest(api, bridgeRequest(`/images/${historyId}/file`))

    expect(generateResponse.status).toBe(201)
    expect(generated.items[0].bridgeFileUrl).toContain(`/images/${historyId}/file`)
    expect(fileResponse.status).toBe(200)
    expect(fileResponse.headers?.['Content-Type']).toBe('image/png')
    expect(fileResponse.bodyBase64).toBe(bridgeImageBase64)
  })

  it('persists and announces a running generation before the Bridge response settles', async () => {
    const api = createPixaiApi()
    await configureImageProvider(api)
    const originalGenerate = api.image.generate
    let resolveProvider: (response: Response) => void = () => undefined
    const providerResponse = new Promise<Response>((resolve) => {
      resolveProvider = resolve
    })
    vi.stubGlobal('fetch', vi.fn(() => providerResponse))
    let resolveStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    let startedRunId: string | null = null
    vi.spyOn(api.image, 'generate').mockImplementation((input, lifecycle) =>
      originalGenerate(input, {
        onRunStarted: async (run) => {
          startedRunId = run.id
          await lifecycle?.onRunStarted?.(run)
          resolveStarted()
        }
      })
    )
    let responseSettled = false

    const responsePromise = handleCodexBridgeRequest(
      api,
      bridgeRequest('/generate', 'POST', {
        prompt: '桥接实时状态测试',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1
      })
    )
    void responsePromise.finally(() => {
      responseSettled = true
    })

    await started
    expect(responseSettled).toBe(false)
    expect(startedRunId).not.toBeNull()
    const conversations = await api.conversation.list()
    await expect(api.conversation.runs(conversations[0].id)).resolves.toEqual([
      expect.objectContaining({ id: startedRunId, status: 'running' })
    ])

    resolveProvider(new Response(JSON.stringify({ data: [{ b64_json: bridgeImageBase64 }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))
    await expect(responsePromise).resolves.toMatchObject({ status: 201 })
  })

  it('uses the same generation lifecycle for reedit requests', async () => {
    const api = createPixaiApi()
    await configureImageProvider(api)
    const sourceResponse = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/generate', 'POST', {
        prompt: '重新编辑来源',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1
      })
    )
    const source = JSON.parse(sourceResponse.body || '{}')
    const generateSpy = vi.spyOn(api.image, 'generate')

    const response = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/images/' + source.items[0].id + '/reedit', 'POST', {
        prompt: '重新编辑后的猫'
      })
    )

    expect(response.status).toBe(201)
    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: '重新编辑后的猫' }),
      expect.objectContaining({ onRunStarted: expect.any(Function) })
    )
  })

  it('reuses the same conversation for the same projectPath', async () => {
    const api = createPixaiApi()
    await configureImageProvider(api)
    const first = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/generate', 'POST', {
        prompt: '项目 A 第一次',
        projectPath: 'C:\\Work\\PixAI\\Repo\\',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1
      })
    )
    const second = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/generate', 'POST', {
        prompt: '项目 A 第二次',
        projectPath: 'c:/work/pixai/repo',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1
      })
    )
    const firstPayload = JSON.parse(first.body || '{}')
    const secondPayload = JSON.parse(second.body || '{}')
    const conversations = await api.conversation.list()

    expect(firstPayload.conversation.id).toBe(secondPayload.conversation.id)
    expect(conversations).toHaveLength(1)
    expect(conversations[0].codexProjectPath).toBe('c:/work/pixai/repo')
  })

  it('separates different projectPath values into different conversations', async () => {
    const api = createPixaiApi()
    await configureImageProvider(api)
    const first = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/generate', 'POST', {
        prompt: '项目 A',
        projectPath: 'C:\\Work\\PixAI\\Repo-A',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1
      })
    )
    const second = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/generate', 'POST', {
        prompt: '项目 B',
        projectPath: 'C:\\Work\\PixAI\\Repo-B',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1
      })
    )
    const firstPayload = JSON.parse(first.body || '{}')
    const secondPayload = JSON.parse(second.body || '{}')
    const conversations = await api.conversation.list()

    expect(firstPayload.conversation.id).not.toBe(secondPayload.conversation.id)
    expect(conversations).toHaveLength(2)
    expect(conversations.map((conversation) => conversation.codexProjectPath)).toEqual([
      'c:/work/pixai/repo-b',
      'c:/work/pixai/repo-a'
    ])
  })

  it('honors explicit conversationId over projectPath routing', async () => {
    const api = createPixaiApi()
    await configureImageProvider(api)
    const firstConversation = await api.conversation.create({ codexProjectPath: 'c:/work/pixai/repo-a' })
    const secondConversation = await api.conversation.create({ codexProjectPath: 'c:/work/pixai/repo-b' })

    const response = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/generate', 'POST', {
        prompt: '显式会话优先',
        conversationId: secondConversation.id,
        projectPath: 'C:\\Work\\PixAI\\Repo-A',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1
      })
    )
    const payload = JSON.parse(response.body || '{}')

    expect(payload.conversation.id).toBe(secondConversation.id)
    expect(payload.conversation.codexProjectPath).toBe('c:/work/pixai/repo-b')
    expect((await api.conversation.get(firstConversation.id))?.codexProjectPath).toBe('c:/work/pixai/repo-a')
  })

  it('keeps the legacy first-conversation fallback when projectPath is missing', async () => {
    const api = createPixaiApi()
    await configureImageProvider(api)
    const firstConversation = await api.conversation.create({ title: 'older' })
    const secondConversation = await api.conversation.create({ title: 'newer' })

    const response = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/generate', 'POST', {
        prompt: '旧回退',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1
      })
    )
    const payload = JSON.parse(response.body || '{}')

    expect(payload.conversation.id).toBe(secondConversation.id)
    expect(payload.conversation.id).not.toBe(firstConversation.id)
  })

  it('returns a preflight error without workspace records when image profile has no API key', async () => {
    const api = createPixaiApi()
    const settings = await api.settings.upsertProfile({
      name: 'No key image',
      baseUrl: 'http://127.0.0.1:37123',
      enabledUsages: ['image']
    })
    const profile = settings.profiles.at(-1)
    await api.settings.update({ selectedImageProfileId: profile?.id })

    const response = await handleCodexBridgeRequest(
      api,
      bridgeRequest('/generate', 'POST', {
        prompt: '桥接生成测试',
        ratio: '1:1',
        size: '1024x1024',
        quality: 'high',
        n: 1
      })
    )
    const payload = JSON.parse(response.body || '{}')
    const conversations = await api.conversation.list()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('API Key 尚未配置。')
    expect(await api.conversation.runs(conversations[0].id)).toHaveLength(0)
    expect(await api.history.list()).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('routes prompt assistant endpoints through the selected prompt provider', async () => {
    const api = createPixaiApi()
    const settings = await api.settings.upsertProfile({
      name: 'Local prompt',
      baseUrl: 'http://127.0.0.1:37123',
      enabledUsages: ['prompt'],
      apiKey: 'sk-123456789'
    })
    const profile = settings.profiles.at(-1)
    await api.settings.update({ selectedPromptProfileId: profile?.id })

    const inspire = await handleCodexBridgeRequest(api, bridgeRequest('/prompt/inspire', 'POST', {}))
    const enrich = await handleCodexBridgeRequest(api, bridgeRequest('/prompt/enrich', 'POST', { prompt: '短提示' }))

    expect(JSON.parse(inspire.body || '{}').prompt).toBe('桥接提示词')
    expect(JSON.parse(enrich.body || '{}').prompt).toBe('桥接提示词')
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:37123/v1/responses', expect.anything())
  })

  it('returns structured errors for unknown routes', async () => {
    const response = await handleCodexBridgeRequest(createPixaiApi(), bridgeRequest('/missing'))
    const payload = JSON.parse(response.body || '{}')

    expect(response.status).toBe(404)
    expect(payload.ok).toBe(false)
    expect(payload.error).toContain('未知 Codex Bridge 路由')
  })
})

async function configureImageProvider(api: PixaiApi) {
  const settings = await api.settings.upsertProfile({
    name: 'Local image',
    baseUrl: 'http://127.0.0.1:37123',
    enabledUsages: ['image'],
    apiKey: 'sk-123456789'
  })
  const profile = settings.profiles.at(-1)
  await api.settings.update({ selectedImageProfileId: profile?.id })
}
