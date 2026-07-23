import { describe, expect, it } from 'vitest'
import { readJsonState, writeJsonState } from '../lib/platform'
import { AppDatabase } from './app-database'

const STATE_NAME = 'pixai-data'
const LEGACY_REFERENCE_PATH = 'C:\\Users\\admin\\AppData\\Local\\com.fingercaster.pixai.tauri\\references\\legacy.png'

describe('AppDatabase', () => {
  it('migrates legacy local reference paths out of persisted dataUrl fields on load', async () => {
    await writeJsonState(STATE_NAME, JSON.stringify({
      conversations: [
        conversation({
          referenceImages: [
            {
              id: 'reference-legacy-path',
              name: 'legacy.png',
              mimeType: 'image/png',
              dataUrl: LEGACY_REFERENCE_PATH,
              fileSizeBytes: 12,
              storagePath: LEGACY_REFERENCE_PATH,
              createdAt: '2026-06-06T01:30:00.000Z'
            }
          ]
        })
      ],
      runs: [],
      history: []
    }))

    const database = new AppDatabase()
    const conversations = await database.listConversations()
    const reference = conversations[0].referenceImages[0]
    const persisted = JSON.parse(await readJsonState(STATE_NAME) || '{}')

    expect(reference).toMatchObject({
      dataUrl: '',
      storagePath: LEGACY_REFERENCE_PATH
    })
    expect(persisted.conversations[0].referenceImages[0]).toMatchObject({
      dataUrl: '',
      storagePath: LEGACY_REFERENCE_PATH
    })
  })

  it('normalizes imported stored references before saving them', async () => {
    const database = new AppDatabase()
    const conversation = await database.createConversation()

    const references = await database.importReferenceImages(conversation.id, [
      {
        name: 'stored.png',
        mimeType: 'image/png',
        dataUrl: LEGACY_REFERENCE_PATH,
        fileSizeBytes: 12,
        storagePath: LEGACY_REFERENCE_PATH
      }
    ])

    expect(references[0]).toMatchObject({
      dataUrl: '',
      storagePath: LEGACY_REFERENCE_PATH
    })
  })

  it('loads legacy conversations without codex project metadata', async () => {
    await writeJsonState(STATE_NAME, JSON.stringify({
      conversations: [conversation()],
      runs: [],
      history: []
    }))

    const database = new AppDatabase()
    const conversations = await database.listConversations()

    expect(conversations[0].codexProjectPath).toBeNull()
  })

  it('finds or creates one normalized conversation per codex project path', async () => {
    const database = new AppDatabase()

    const first = await database.findOrCreateCodexProjectConversation('C:\\Work\\PixAI\\Repo\\')
    const reused = await database.findOrCreateCodexProjectConversation('c:/work/pixai/repo')
    const different = await database.findOrCreateCodexProjectConversation('C:\\Work\\PixAI\\Other')
    const conversations = await database.listConversations()

    expect(reused.id).toBe(first.id)
    expect(different.id).not.toBe(first.id)
    expect(conversations).toHaveLength(2)
    expect(await database.findCodexProjectConversation('C:/WORK/PIXA I/Repo')).toBeNull()
    expect((await database.findCodexProjectConversation('C:\\WORK\\PIXAI\\REPO'))?.id).toBe(first.id)
  })
})

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conversation-legacy-reference',
    title: 'Legacy reference',
    draftPrompt: '',
    model: 'gpt-image-2',
    ratio: '1:1',
    size: '1024x1024',
    quality: 'high',
    n: 1,
    outputFormat: 'png',
    outputCompression: null,
    background: 'auto',
    moderation: 'auto',
    stream: false,
    partialImages: null,
    inputFidelity: null,
    maxRetries: 0,
    generationTimeoutSeconds: 600,
    autoSaveHistory: true,
    keepFailureDetails: true,
    referenceImages: [],
    createdAt: '2026-06-06T01:00:00.000Z',
    updatedAt: '2026-06-06T01:00:00.000Z',
    ...overrides
  }
}
