import { create } from 'zustand'
import { pixaiApi } from '../services/app-api'
import { DEFAULT_IMAGE_OUTPUT_FORMAT, DEFAULT_MODEL, getDefaultImageSize, isImageSizeCompatible, normalizeImageGenerationTimeoutSeconds } from '../shared/image-options'
import type {
  Conversation,
  ConversationCreateInput,
  ConversationUpdate,
  GenerateImageInput,
  GenerationRun,
  HistoryListOptions,
  ImageHistoryItem,
  PromptTemplate,
  PromptTemplateInput,
  ProviderProfileInput,
  ProviderSettings,
  ProviderSettingsUpdate
} from '../shared/types'

type View = 'workspace' | 'gallery' | 'prompts'

type AppState = {
  view: View
  settingsVisible: boolean
  darkMode: boolean
  settings: ProviderSettings | null
  conversations: Conversation[]
  activeConversationId: string | null
  runsByConversation: Record<string, GenerationRun[]>
  history: ImageHistoryItem[]
  templates: PromptTemplate[]
  query: string
  favoritesOnly: boolean
  loading: boolean
  promptAssistantRunning: { inspire: boolean; enrich: boolean }
  toast: string | null
  load: () => Promise<void>
  setView: (view: View) => void
  toggleSettings: () => void
  toggleTheme: () => void
  setQuery: (query: string) => void
  setFavoritesOnly: (favoritesOnly: boolean) => Promise<void>
  setActiveConversation: (id: string) => Promise<void>
  createConversation: (template?: ConversationCreateInput) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  updateActiveConversation: (input: ConversationUpdate) => Promise<void>
  updateSettings: (input: ProviderSettingsUpdate) => Promise<void>
  upsertProfile: (input: ProviderProfileInput) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  testProfile: (id: string) => Promise<void>
  importReferenceFiles: (files: File[]) => Promise<void>
  addHistoryAsReference: (historyId: string) => Promise<void>
  removeReferenceImage: (referenceImageId: string) => Promise<void>
  reorderReferenceImages: (referenceImageIds: string[]) => Promise<void>
  inspirePrompt: () => Promise<void>
  enrichPrompt: () => Promise<void>
  generate: () => Promise<void>
  cancelGeneration: (runId?: string, requestIndex?: number) => Promise<void>
  refreshConversationResults: (conversationId: string) => Promise<void>
  reloadHistory: (options?: Partial<HistoryListOptions>) => Promise<void>
  deleteHistory: (id: string) => Promise<void>
  toggleFavorite: (item: ImageHistoryItem) => Promise<void>
  reuseHistory: (item: ImageHistoryItem) => Promise<void>
  loadTemplates: () => Promise<void>
  saveTemplate: (input: PromptTemplateInput & { id?: string }) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  applyPromptTemplate: (template: PromptTemplate) => Promise<void>
  notify: (message: string | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'workspace',
  settingsVisible: true,
  darkMode: false,
  settings: null,
  conversations: [],
  activeConversationId: null,
  runsByConversation: {},
  history: [],
  templates: [],
  query: '',
  favoritesOnly: false,
  loading: false,
  promptAssistantRunning: { inspire: false, enrich: false },
  toast: null,
  load: async () => {
    set({ loading: true })
    const settings = await pixaiApi.settings.get()
    let conversations = await pixaiApi.conversation.list()
    if (conversations.length === 0) conversations = [await pixaiApi.conversation.create()]
    const activeConversationId = get().activeConversationId || conversations[0]?.id || null
    const runs = activeConversationId ? await pixaiApi.conversation.runs(activeConversationId) : []
    const history = await pixaiApi.history.list({ sort: 'newest' })
    const templates = await pixaiApi.templates.list()
    set({
      settings,
      conversations,
      activeConversationId,
      runsByConversation: activeConversationId ? { [activeConversationId]: runs } : {},
      history,
      templates,
      loading: false
    })
  },
  setView: (view) => set({ view }),
  toggleSettings: () => set((state) => ({ settingsVisible: !state.settingsVisible, view: 'workspace' })),
  toggleTheme: () => set((state) => ({ darkMode: !state.darkMode })),
  setQuery: (query) => set({ query }),
  setFavoritesOnly: async (favoritesOnly) => {
    set({ favoritesOnly })
    await get().reloadHistory({ favoritesOnly })
  },
  setActiveConversation: async (id) => {
    set({ activeConversationId: id, view: 'workspace' })
    if (!get().runsByConversation[id]) {
      const runs = await pixaiApi.conversation.runs(id)
      set({ runsByConversation: { ...get().runsByConversation, [id]: runs } })
    }
  },
  createConversation: async (template = {}) => {
    const current = getActiveConversation(get())
    const conversation = await pixaiApi.conversation.create({
      ratio: template.ratio ?? current?.ratio,
      size: template.size ?? current?.size,
      quality: template.quality ?? current?.quality,
      model: template.model ?? current?.model,
      n: template.n ?? current?.n,
      outputFormat: template.outputFormat ?? current?.outputFormat,
      outputCompression: template.outputCompression ?? current?.outputCompression,
      background: template.background ?? current?.background,
      moderation: template.moderation ?? current?.moderation,
      stream: template.stream ?? current?.stream,
      partialImages: template.partialImages ?? current?.partialImages,
      inputFidelity: template.inputFidelity ?? current?.inputFidelity,
      maxRetries: template.maxRetries ?? current?.maxRetries,
      generationTimeoutSeconds: template.generationTimeoutSeconds ?? current?.generationTimeoutSeconds,
      autoSaveHistory: template.autoSaveHistory ?? current?.autoSaveHistory,
      keepFailureDetails: template.keepFailureDetails ?? current?.keepFailureDetails
    })
    set({
      conversations: [conversation, ...get().conversations],
      activeConversationId: conversation.id,
      view: 'workspace',
      runsByConversation: { ...get().runsByConversation, [conversation.id]: [] }
    })
    get().notify('已新建会话')
  },
  deleteConversation: async (id) => {
    await pixaiApi.conversation.delete(id)
    let conversations = get().conversations.filter((conversation) => conversation.id !== id)
    if (conversations.length === 0) conversations = [await pixaiApi.conversation.create()]
    const activeConversationId = get().activeConversationId === id ? conversations[0]?.id || null : get().activeConversationId
    const runsByConversation = { ...get().runsByConversation }
    delete runsByConversation[id]
    set({ conversations, activeConversationId, runsByConversation })
    await get().reloadHistory()
    get().notify('已删除会话，历史记录已保留')
  },
  updateActiveConversation: async (input) => {
    const id = get().activeConversationId
    if (!id) return
    const normalized = input.ratio && input.size === undefined ? { ...input, size: getDefaultImageSize(input.ratio) } : input
    set({
      conversations: get().conversations.map((conversation) =>
        conversation.id === id ? { ...conversation, ...normalized, updatedAt: new Date().toISOString() } : conversation
      )
    })
    const updated = await pixaiApi.conversation.update(id, normalized)
    set({ conversations: get().conversations.map((conversation) => (conversation.id === id ? updated : conversation)) })
  },
  updateSettings: async (input) => {
    const settings = await pixaiApi.settings.update(input)
    set({ settings })
    get().notify('设置已保存')
  },
  upsertProfile: async (input) => {
    const settings = await pixaiApi.settings.upsertProfile(input)
    set({ settings })
    get().notify('服务配置已保存')
  },
  deleteProfile: async (id) => {
    const settings = await pixaiApi.settings.deleteProfile(id)
    set({ settings })
    get().notify('服务配置已删除')
  },
  testProfile: async (id) => {
    const settings = await pixaiApi.settings.testProfile(id)
    set({ settings })
    const profile = settings.profiles.find((item) => item.id === id)
    get().notify(profile?.lastTest?.message || '连接测试完成')
  },
  importReferenceFiles: async (files) => {
    const id = get().activeConversationId
    if (!id || files.length === 0) return
    try {
      const referenceImages = await pixaiApi.reference.importFiles(id, files)
      set({ conversations: get().conversations.map((conversation) => (conversation.id === id ? { ...conversation, referenceImages } : conversation)) })
      get().notify(`已添加 ${files.length} 张参考图`)
    } catch (error) {
      get().notify(error instanceof Error ? error.message : '参考图添加失败')
    }
  },
  addHistoryAsReference: async (historyId) => {
    const id = get().activeConversationId
    if (!id) return
    const source = get().history.find((item) => item.id === historyId)
    const referenceImages = await pixaiApi.reference.addFromHistory(id, historyId)
    const updated = await pixaiApi.conversation.update(id, {
      referenceImages,
      draftPrompt: source?.prompt || '',
      model: source?.model,
      ratio: source?.ratio,
      size: source?.size || undefined,
      quality: source?.quality
    } as ConversationUpdate)
    set({
      conversations: get().conversations.map((conversation) => (conversation.id === id ? updated : conversation)),
      view: 'workspace'
    })
    get().notify('已进入编辑')
  },
  removeReferenceImage: async (referenceImageId) => {
    const id = get().activeConversationId
    if (!id) return
    const referenceImages = await pixaiApi.reference.remove(id, referenceImageId)
    set({ conversations: get().conversations.map((conversation) => (conversation.id === id ? { ...conversation, referenceImages } : conversation)) })
  },
  reorderReferenceImages: async (referenceImageIds) => {
    const id = get().activeConversationId
    if (!id) return
    const referenceImages = await pixaiApi.reference.reorder(id, referenceImageIds)
    set({ conversations: get().conversations.map((conversation) => (conversation.id === id ? { ...conversation, referenceImages } : conversation)) })
  },
  inspirePrompt: async () => {
    const conversation = getActiveConversation(get())
    if (!conversation || get().promptAssistantRunning.inspire) return
    set({ promptAssistantRunning: { ...get().promptAssistantRunning, inspire: true } })
    try {
      const prompt = await pixaiApi.prompt.inspire({ hasReferenceImages: conversation.referenceImages.length > 0 })
      await get().updateActiveConversation({ draftPrompt: prompt })
      get().notify('已生成灵感提示词')
    } catch (error) {
      get().notify(error instanceof Error ? `提示词生成失败：${error.message}` : '提示词生成失败')
    } finally {
      set({ promptAssistantRunning: { ...get().promptAssistantRunning, inspire: false } })
    }
  },
  enrichPrompt: async () => {
    const conversation = getActiveConversation(get())
    const prompt = conversation?.draftPrompt.trim() || ''
    if (!conversation || !prompt || get().promptAssistantRunning.enrich) return
    set({ promptAssistantRunning: { ...get().promptAssistantRunning, enrich: true } })
    try {
      const nextPrompt = await pixaiApi.prompt.enrich({
        prompt,
        hasReferenceImages: conversation.referenceImages.length > 0
      })
      await get().updateActiveConversation({ draftPrompt: nextPrompt })
      get().notify('已丰富提示词')
    } catch (error) {
      get().notify(error instanceof Error ? `提示词生成失败：${error.message}` : '提示词生成失败')
    } finally {
      set({ promptAssistantRunning: { ...get().promptAssistantRunning, enrich: false } })
    }
  },
  generate: async () => {
    const conversation = getActiveConversation(get())
    if (!conversation) return
    const prompt = conversation.draftPrompt.trim()
    const input: GenerateImageInput = {
      conversationId: conversation.id,
      prompt,
      model: conversation.model || getSelectedImageProfile(get().settings)?.defaultImageModel || DEFAULT_MODEL,
      ratio: conversation.ratio,
      size: isImageSizeCompatible(conversation.ratio, conversation.size) ? conversation.size : getDefaultImageSize(conversation.ratio),
      quality: conversation.quality,
      n: conversation.n,
      outputFormat: conversation.outputFormat || DEFAULT_IMAGE_OUTPUT_FORMAT,
      outputCompression: conversation.outputCompression ?? undefined,
      background: conversation.background,
      moderation: conversation.moderation,
      stream: conversation.stream,
      partialImages: conversation.partialImages ?? undefined,
      inputFidelity: conversation.inputFidelity ?? undefined,
      maxRetries: conversation.maxRetries,
      generationTimeoutSeconds: normalizeImageGenerationTimeoutSeconds(conversation.generationTimeoutSeconds),
      referenceImageIds: conversation.referenceImages.map((reference) => reference.id)
    }
    if (conversation.title === '新会话' && prompt) {
      await get().updateActiveConversation({ title: prompt.length > 18 ? `${prompt.slice(0, 18)}...` : prompt })
    }
    try {
      const result = await pixaiApi.image.generate(input)
      await get().refreshConversationResults(conversation.id)
      await get().reloadHistory()
      get().notify(result.errorMessage ? `生成失败：${result.errorMessage}` : '生成完成')
    } catch (error) {
      get().notify(error instanceof Error ? `生成失败：${error.message}` : '生成失败')
    }
  },
  cancelGeneration: async (runId, requestIndex) => {
    if (!runId) return
    await pixaiApi.image.cancel(runId, requestIndex)
  },
  refreshConversationResults: async (conversationId) => {
    const runs = await pixaiApi.conversation.runs(conversationId)
    set({ runsByConversation: { ...get().runsByConversation, [conversationId]: runs } })
  },
  reloadHistory: async (options = {}) => {
    const state = get()
    const history = await pixaiApi.history.list({
      query: options.query ?? state.query,
      favoritesOnly: options.favoritesOnly ?? state.favoritesOnly,
      sort: options.sort ?? 'newest'
    })
    set({ history })
  },
  deleteHistory: async (id) => {
    await pixaiApi.history.delete(id)
    await get().reloadHistory()
    get().notify('已删除历史项')
  },
  toggleFavorite: async (item) => {
    await pixaiApi.history.favorite(item.id, !item.favorite)
    await get().reloadHistory()
  },
  reuseHistory: async (item) => {
    let id = get().activeConversationId
    if (!id) {
      await get().createConversation()
      id = get().activeConversationId
    }
    if (!id) return
    const updated = await pixaiApi.conversation.update(id, {
      draftPrompt: item.prompt,
      model: item.model,
      ratio: item.ratio,
      size: item.size || getDefaultImageSize(item.ratio),
      quality: item.quality
    })
    set({
      conversations: get().conversations.map((conversation) => (conversation.id === id ? updated : conversation)),
      view: 'workspace'
    })
    get().notify('已回填到当前会话')
  },
  loadTemplates: async () => {
    const templates = await pixaiApi.templates.list()
    set({ templates })
  },
  saveTemplate: async (input) => {
    await pixaiApi.templates.upsert(input)
    await get().loadTemplates()
    get().notify('提示词模板已保存')
  },
  deleteTemplate: async (id) => {
    await pixaiApi.templates.delete(id)
    await get().loadTemplates()
    get().notify('提示词模板已删除')
  },
  applyPromptTemplate: async (template) => {
    const id = get().activeConversationId
    if (!id) return
    const updated = await pixaiApi.conversation.update(id, {
      draftPrompt: template.prompt,
      ratio: template.ratio,
      size: getDefaultImageSize(template.ratio),
      quality: template.quality,
      title: template.title
    })
    set({
      conversations: get().conversations.map((conversation) => (conversation.id === id ? updated : conversation)),
      view: 'workspace'
    })
    get().notify(`已套用「${template.title}」`)
  },
  notify: (message) => {
    set({ toast: message })
    if (message) window.setTimeout(() => set({ toast: null }), 2200)
  }
}))

function getActiveConversation(state: AppState): Conversation | null {
  return state.conversations.find((conversation) => conversation.id === state.activeConversationId) || null
}

function getSelectedImageProfile(settings: ProviderSettings | null) {
  return settings?.profiles.find((profile) => profile.id === settings.selectedImageProfileId) || settings?.profiles[0] || null
}
