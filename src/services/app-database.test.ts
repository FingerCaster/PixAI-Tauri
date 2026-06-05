import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetPlatformStateForTests } from '../lib/platform'
import { AppDatabase } from './app-database'

describe('AppDatabase.createConversation', () => {
  beforeEach(() => {
    __resetPlatformStateForTests()
  })

  afterEach(() => {
    __resetPlatformStateForTests()
  })

  it('stores explicit title, draft prompt, and reference images on creation', async () => {
    const database = new AppDatabase()
    const referenceImages = [
      {
        id: 'reference-1',
        name: 'ref.png',
        mimeType: 'image/png',
        dataUrl: '',
        fileSizeBytes: 123,
        storagePath: 'browser-memory/references/ref.png',
        createdAt: '2026-06-05T10:00:00.000Z'
      }
    ]

    const conversation = await database.createConversation({
      title: '历史重做',
      draftPrompt: '雨夜玻璃城市',
      model: 'gpt-image-2',
      ratio: '16:9',
      size: '1792x1008',
      quality: 'high',
      referenceImages
    })

    expect(conversation).toMatchObject({
      title: '历史重做',
      draftPrompt: '雨夜玻璃城市',
      model: 'gpt-image-2',
      ratio: '16:9',
      size: '1792x1008',
      quality: 'high'
    })
    expect(conversation.referenceImages).toEqual(referenceImages)
    await expect(database.getConversation(conversation.id)).resolves.toMatchObject({
      title: '历史重做',
      draftPrompt: '雨夜玻璃城市',
      referenceImages
    })
  })

  it('defaults to a blank history-safe conversation when no title or prompt is provided', async () => {
    const database = new AppDatabase()

    const conversation = await database.createConversation()

    expect(conversation).toMatchObject({
      title: '新会话',
      draftPrompt: '',
      referenceImages: []
    })
  })
})
