import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openAiCompatibleAdapter } from '../adapters/openai-compatible'
import { __resetPlatformStateForTests, writeJsonState } from '../lib/platform'
import type { GenerationOrigin, GenerationRun, ImageHistoryItem } from '../shared/types'
import { AppDatabase } from './app-database'
import { ImageService } from './image-service'
import { ProviderSettingsStore } from './provider-settings'

const DATA_STATE_NAME = 'pixai-data'

describe('ImageService', () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  })

  it('downloads remote image urls before persisting generated history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/v1/images/generations')) {
          return new Response(JSON.stringify({ data: [{ url: 'https://example.test/generated.png' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        }
        if (url === 'https://example.test/generated.png') {
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {
              'content-type': 'image/png',
              'content-length': '3'
            }
          })
        }
        throw new Error(`Unexpected fetch URL: ${url}`)
      })
    )
    const providers = new ProviderSettingsStore()
    const settings = await providers.upsertProfile({
      name: 'Image provider',
      baseUrl: 'http://127.0.0.1:37123',
      enabledUsages: ['image'],
      apiKey: 'sk-123456789'
    })
    await providers.update({ selectedImageProfileId: settings.profiles.at(-1)?.id })
    const database = new AppDatabase()
    const conversation = await database.createConversation()
    const service = new ImageService(database, providers)

    const result = await service.generate({
      conversationId: conversation.id,
      prompt: 'a generated cat',
      ratio: '1:1',
      size: '1024x1024',
      quality: 'high',
      n: 1,
      outputFormat: 'png',
      maxRetries: 0
    })

    expect(fetch).toHaveBeenCalledWith('https://example.test/generated.png', {
      headers: { Accept: 'image/png,image/jpeg,image/webp' }
    })
    expect(result.items[0]).toMatchObject({
      status: 'succeeded',
      dataUrl: 'data:image/png;base64,AQID',
      fileSizeBytes: 3
    })
    expect(result.items[0].storagePath).toContain('browser-memory/images/')
  })
})

describe('ImageService generation origin', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    __resetPlatformStateForTests()
  })

  it('persists canvas origin on runs and successful history items', async () => {
    const { database, service, conversationId } = await createImageServiceFixture()
    const origin: GenerationOrigin = {
      kind: 'canvas',
      canvasProjectId: 'canvas-origin-success',
      canvasNodeId: 'node-origin-success'
    }
    vi.spyOn(openAiCompatibleAdapter, 'generateImage').mockResolvedValue([{ b64_json: 'aGVsbG8=' }])

    const result = await service.generate({
      conversationId,
      prompt: '来自 Canvas 的光影草图',
      ratio: '1:1',
      size: '1024x1024',
      quality: 'high',
      n: 1,
      origin
    })

    expect(result.run.origin).toEqual(origin)
    expect(result.items[0]).toMatchObject({
      status: 'succeeded',
      origin
    })
    await expect(database.getRun(result.run.id)).resolves.toMatchObject({ origin })
    await expect(database.listHistory({ query: 'canvas' })).resolves.toEqual([
      expect.objectContaining({ id: result.items[0].id, origin })
    ])
    await expect(database.listHistory({ query: '画布' })).resolves.toEqual([
      expect.objectContaining({ id: result.items[0].id, origin })
    ])
  })

  it('persists canvas origin on failed history items', async () => {
    const { database, service, conversationId } = await createImageServiceFixture()
    const origin: GenerationOrigin = {
      kind: 'canvas',
      canvasProjectId: 'canvas-origin-failure',
      canvasNodeId: 'node-origin-failure'
    }
    vi.spyOn(openAiCompatibleAdapter, 'generateImage').mockRejectedValue(new Error('upstream failed'))

    const result = await service.generate({
      conversationId,
      prompt: '会失败的 Canvas 生成',
      ratio: '1:1',
      size: '1024x1024',
      quality: 'high',
      n: 1,
      origin
    })

    expect(result.run).toMatchObject({ status: 'failed', origin })
    expect(result.items[0]).toMatchObject({
      status: 'failed',
      errorMessage: 'upstream failed',
      origin
    })
    await expect(database.listHistory({ status: 'failed', query: '画布' })).resolves.toEqual([
      expect.objectContaining({ id: result.items[0].id, origin })
    ])
  })
})

describe('ImageService generated image normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    __resetPlatformStateForTests()
  })

  it('downloads remote image urls before persisting successful image-to-image history', async () => {
    const { database, service, conversationId } = await createImageServiceFixture()
    const referenceImage = {
      id: 'reference-existing-image',
      name: 'reference.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,cmVm',
      fileSizeBytes: 3,
      createdAt: '2026-06-05T00:00:00.000Z'
    }
    await database.updateConversation(conversationId, { referenceImages: [referenceImage] })
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': '3'
      }
    }))
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(openAiCompatibleAdapter, 'generateImage').mockResolvedValue([{ url: 'https://example.com/generated.png' }])

    const result = await service.generate({
      conversationId,
      prompt: '生成一只猫',
      ratio: '1:1',
      size: '1024x1024',
      quality: 'high',
      n: 1,
      outputFormat: 'png',
      referenceImageIds: [referenceImage.id]
    })

    expect(fetch).toHaveBeenCalledWith('https://example.com/generated.png', {
      headers: { Accept: 'image/png,image/jpeg,image/webp' }
    })
    expect(result.run).toMatchObject({
      status: 'succeeded',
      generationMode: 'image-to-image'
    })
    expect(result.items[0]).toMatchObject({
      status: 'succeeded',
      dataUrl: 'data:image/png;base64,AQID',
      storagePath: expect.stringMatching(/^browser-memory\/images\/image_.+\.png$/),
      fileSizeBytes: 3
    })
  })

  it('marks the run as failed when history persistence breaks after image generation succeeds', async () => {
    const { database, service, conversationId } = await createImageServiceFixture()
    vi.spyOn(openAiCompatibleAdapter, 'generateImage').mockResolvedValue([{ b64_json: 'aGVsbG8=' }])
    const insertHistory = vi.spyOn(database, 'insertHistory')
    insertHistory
      .mockRejectedValueOnce(new Error('history write failed'))
      .mockImplementation(async (item) => item as ImageHistoryItem)

    const result = await service.generate({
      conversationId,
      prompt: '生成一只猫',
      ratio: '1:1',
      size: '1024x1024',
      quality: 'high',
      n: 1,
      outputFormat: 'png'
    })

    expect(result.run.status).toBe('failed')
    expect(result.run.errorMessage).toBe('图片生成失败。')
    expect(result.items[0]).toMatchObject({
      status: 'failed',
      errorMessage: 'history write failed'
    })
    expect(insertHistory).toHaveBeenCalledTimes(2)
  })
})

describe('AppDatabase generation origin normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps valid canvas origins and drops invalid legacy origins', async () => {
    const validOrigin: GenerationOrigin = {
      kind: 'canvas',
      canvasProjectId: 'canvas-valid-origin',
      canvasNodeId: 'node-valid-origin'
    }
    await writeJsonState(DATA_STATE_NAME, JSON.stringify({
      conversations: [],
      runs: [
        generationRunRecord('run-invalid-origin', { kind: 'canvas', canvasProjectId: '', canvasNodeId: 'node-invalid' } as unknown as GenerationOrigin),
        generationRunRecord('run-valid-origin', validOrigin)
      ],
      history: [
        historyItemRecord('history-invalid-origin', { kind: 'canvas', canvasProjectId: 'canvas-invalid', canvasNodeId: '' } as unknown as GenerationOrigin),
        historyItemRecord('history-valid-origin', validOrigin)
      ]
    }))
    const database = new AppDatabase()

    const invalidRun = await database.getRun('run-invalid-origin')
    const validRun = await database.getRun('run-valid-origin')
    expect(invalidRun?.origin).toBeUndefined()
    expect(validRun?.origin).toEqual(validOrigin)
    const allHistory = await database.listHistory({ sort: 'oldest' })
    expect(allHistory.find((item) => item.id === 'history-invalid-origin')?.origin).toBeUndefined()
    expect(allHistory.find((item) => item.id === 'history-valid-origin')?.origin).toEqual(validOrigin)
    await expect(database.listHistory({ query: 'canvas' })).resolves.toEqual([
      expect.objectContaining({ id: 'history-valid-origin', origin: validOrigin })
    ])
  })
})

async function createImageServiceFixture(): Promise<{ database: AppDatabase; service: ImageService; conversationId: string }> {
  const database = new AppDatabase()
  const providers = new ProviderSettingsStore()
  await providers.upsertProfile({
    id: 'origin-test-provider',
    apiKey: 'sk-origin-test'
  })
  const conversation = await database.createConversation({
    model: 'gpt-image-2',
    ratio: '1:1',
    size: '1024x1024',
    quality: 'high'
  })
  return {
    database,
    service: new ImageService(database, providers),
    conversationId: conversation.id
  }
}

function generationRunRecord(id: string, origin: GenerationOrigin): GenerationRun {
  return {
    id,
    conversationId: 'conversation-origin-normalize',
    prompt: 'origin normalize run',
    model: 'gpt-image-2',
    ratio: '1:1',
    size: '1024x1024',
    quality: 'high',
    n: 1,
    status: 'succeeded',
    durationMs: 1000,
    errorMessage: null,
    errorDetails: null,
    maxRetries: 0,
    retryAttempts: {},
    retryFailures: {},
    generationMode: 'text-to-image',
    referenceImages: [],
    origin,
    createdAt: '2026-06-05T00:00:00.000Z',
    items: []
  }
}

function historyItemRecord(id: string, origin: GenerationOrigin): ImageHistoryItem {
  return {
    id,
    conversationId: 'conversation-origin-normalize',
    runId: 'run-origin-normalize',
    prompt: 'origin normalize history',
    model: 'gpt-image-2',
    ratio: '1:1',
    size: '1024x1024',
    quality: 'high',
    requestIndex: 0,
    durationMs: 1000,
    dataUrl: null,
    fileSizeBytes: null,
    status: 'failed',
    errorMessage: 'failed',
    errorDetails: null,
    retryAttempt: 0,
    favorite: false,
    generationMode: 'text-to-image',
    referenceImages: [],
    origin,
    createdAt: id === 'history-valid-origin' ? '2026-06-05T00:01:00.000Z' : '2026-06-05T00:00:00.000Z'
  }
}
