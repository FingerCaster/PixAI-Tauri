import { openPath } from '@tauri-apps/plugin-opener'
import { AppDatabase } from './app-database'
import { ImageService } from './image-service'
import { PromptService } from './prompt-service'
import { PromptTemplateStore } from './prompt-templates'
import { ProviderSettingsStore } from './provider-settings'
import type {
  ConversationCreateInput,
  ConversationUpdate,
  GenerateImageInput,
  HistoryListOptions,
  PromptAssistInput,
  PromptTemplateInput,
  ProviderProfileInput,
  ProviderSettingsUpdate
} from '../shared/types'

const database = new AppDatabase()
const providers = new ProviderSettingsStore()
const images = new ImageService(database, providers)
const prompts = new PromptService(providers)
const templates = new PromptTemplateStore()

export const pixaiApi = {
  settings: {
    get: () => providers.get(),
    update: (input: ProviderSettingsUpdate) => providers.update(input),
    upsertProfile: (input: ProviderProfileInput) => providers.upsertProfile(input),
    deleteProfile: (id: string) => providers.deleteProfile(id),
    testProfile: (id: string) => providers.testProfile(id)
  },
  conversation: {
    list: () => database.listConversations(),
    create: (input?: ConversationCreateInput) => database.createConversation(input),
    update: (id: string, input: ConversationUpdate) => database.updateConversation(id, input),
    delete: (id: string) => database.deleteConversation(id),
    runs: (id: string) => database.listRuns(id)
  },
  image: {
    generate: (input: GenerateImageInput) => images.generate(input),
    cancel: (runId: string, requestIndex?: number) => images.cancel(runId, requestIndex)
  },
  prompt: {
    inspire: (input?: PromptAssistInput) => prompts.inspire(input),
    enrich: (input: PromptAssistInput & { prompt: string }) => prompts.enrich(input)
  },
  reference: {
    importFiles: (conversationId: string, files: File[]) => importReferenceFiles(conversationId, files),
    addFromHistory: (conversationId: string, historyId: string) => database.addHistoryImageAsReference(conversationId, historyId),
    remove: (conversationId: string, referenceImageId: string) => database.removeReference(conversationId, referenceImageId),
    reorder: (conversationId: string, referenceImageIds: string[]) => database.reorderReferences(conversationId, referenceImageIds)
  },
  history: {
    list: (options?: HistoryListOptions) => database.listHistory(options),
    delete: (id: string) => database.deleteHistory(id),
    favorite: (id: string, favorite: boolean) => database.setFavorite(id, favorite)
  },
  templates: {
    list: () => templates.list(),
    upsert: (input: PromptTemplateInput & { id?: string }) => templates.upsert(input),
    delete: (id: string) => templates.delete(id)
  },
  shell: {
    openPath: (path: string) => openPath(path)
  }
}

async function importReferenceFiles(conversationId: string, files: File[]) {
  const payload = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      mimeType: file.type,
      dataUrl: await fileToDataUrl(file),
      fileSizeBytes: file.size
    }))
  )
  return database.importReferenceImages(conversationId, payload)
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'))
    reader.readAsDataURL(file)
  })
}
