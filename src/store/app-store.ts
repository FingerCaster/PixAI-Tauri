import { create } from 'zustand'
import { pixaiApi } from '../services/app-api'
import { ImageGenerationPreflightError } from '../services/image-service'
import { DEFAULT_IMAGE_OUTPUT_FORMAT, DEFAULT_MODEL, getDefaultImageSize, isImageSizeCompatible, normalizeImageGenerationTimeoutSeconds } from '../shared/image-options'
import { sendSystemNotification } from '../lib/platform'
import { formatDuration } from '../lib/time'
import type {
  AppPreferences,
  AppPreferencesUpdate,
  CodexSkillStatus,
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
import {
  beginConversationGeneration,
  endConversationGeneration,
  getConversationGenerationState as getConversationGenerationStateForId,
  markGenerationRequestRemoved,
  pruneRemovedGenerationIndexesByRunId
} from './generation-state'

type View = 'workspace' | 'gallery' | 'prompts'

type AppState = {
  view: View
  settingsVisible: boolean
  darkMode: boolean
  settings: ProviderSettings | null
  preferences: AppPreferences | null
  windowFocused: boolean
  conversations: Conversation[]
  activeConversationId: string | null
  runsByConversation: Record<string, GenerationRun[]>
  history: ImageHistoryItem[]
  templates: PromptTemplate[]
  codexSkillStatus: CodexSkillStatus | null
  codexSkillInstalling: boolean
  query: string
  favoritesOnly: boolean
  loading: boolean
  generationClockMs: number
  generatingByConversation: Record<string, number>
  generationStartedAtByConversation: Record<string, number>
  removedGenerationIndexesByRunId: Record<string, number[]>
  promptAssistantRunning: { inspire: boolean; enrich: boolean }
  toast: string | null
  getConversationGenerationState: (conversationId: string) => { generating: boolean; startedAt: number | null; activeCount: number }
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
  updatePreferences: (input: AppPreferencesUpdate) => Promise<void>
  refreshNotificationPermission: () => Promise<void>
  requestNotificationPermission: () => Promise<void>
  setWindowFocused: (focused: boolean) => void
  upsertProfile: (input: ProviderProfileInput) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  testProfile: (id: string) => Promise<void>
  loadCodexSkillStatus: () => Promise<void>
  installCodexSkill: () => Promise<void>
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
  deleteHistoryItems: (ids: string[]) => Promise<void>
  toggleFavorite: (item: ImageHistoryItem) => Promise<void>
  reuseHistory: (item: ImageHistoryItem) => Promise<void>
  loadTemplates: () => Promise<void>
  saveTemplate: (input: PromptTemplateInput & { id?: string }) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  applyPromptTemplate: (template: PromptTemplate) => Promise<void>
  notify: (message: string | null) => void
}

let generationClockTimer: number | null = null

function startGenerationClock(): void {
  if (generationClockTimer != null || typeof window === 'undefined') return
  generationClockTimer = window.setInterval(() => {
    useAppStore.setState({ generationClockMs: Date.now() })
  }, 1000)
}

function stopGenerationClock(): void {
  if (generationClockTimer == null) return
  window.clearInterval(generationClockTimer)
  generationClockTimer = null
}

function collectRunningRunIds(runsByConversation: Record<string, GenerationRun[]>): string[] {
  return Object.values(runsByConversation)
    .flatMap((runs) => runs.filter((run) => run.status === 'running').map((run) => run.id))
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'workspace',
  settingsVisible: true,
  darkMode: false,
  settings: null,
  preferences: null,
  windowFocused: true,
  conversations: [],
  activeConversationId: null,
  runsByConversation: {},
  history: [],
  templates: [],
  codexSkillStatus: null,
  codexSkillInstalling: false,
  query: '',
  favoritesOnly: false,
  loading: false,
  generationClockMs: Date.now(),
  generatingByConversation: {},
  generationStartedAtByConversation: {},
  removedGenerationIndexesByRunId: {},
  promptAssistantRunning: { inspire: false, enrich: false },
  toast: null,
  getConversationGenerationState: (conversationId) =>
    getConversationGenerationStateForId(conversationId, get().generatingByConversation, get().generationStartedAtByConversation),
  load: async () => {
    set({ loading: true })
    const [settings, preferences] = await Promise.all([
      pixaiApi.settings.get(),
      pixaiApi.preferences.get()
    ])
    let conversations = await pixaiApi.conversation.list()
    if (conversations.length === 0) conversations = [await pixaiApi.conversation.create()]
    const activeConversationId = get().activeConversationId || conversations[0]?.id || null
    const runs = activeConversationId ? await pixaiApi.conversation.runs(activeConversationId) : []
    const history = await pixaiApi.history.list({ sort: 'newest' })
    const templates = await pixaiApi.templates.list()
    set({
      settings,
      preferences,
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
  updatePreferences: async (input) => {
    const preferences = await pixaiApi.preferences.update(input)
    set({ preferences })
    if (preferences.notifyOnImageSuccess) void get().refreshNotificationPermission()
    get().notify('设置已保存')
  },
  refreshNotificationPermission: async () => {
    const preferences = await pixaiApi.preferences.refreshNotificationPermission()
    set({ preferences })
  },
  requestNotificationPermission: async () => {
    const preferences = await pixaiApi.preferences.requestNotificationPermission()
    set({ preferences })
    get().notify(preferences.notificationPermission === 'granted' ? '系统通知已启用' : '系统通知权限不可用，已保留应用内提示')
  },
  setWindowFocused: (focused) => set({ windowFocused: focused }),
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
  loadCodexSkillStatus: async () => {
    try {
      set({ codexSkillStatus: await pixaiApi.codexSkill.status() })
    } catch (error) {
      get().notify(error instanceof Error ? `技能状态读取失败：${error.message}` : '技能状态读取失败')
    }
  },
  installCodexSkill: async () => {
    if (get().codexSkillInstalling) return
    set({ codexSkillInstalling: true })
    try {
      const codexSkillStatus = await pixaiApi.codexSkill.install()
      set({ codexSkillStatus })
      get().notify('Codex 技能已安装到全局')
    } catch (error) {
      get().notify(error instanceof Error ? `技能安装失败：${error.message}` : '技能安装失败')
    } finally {
      set({ codexSkillInstalling: false })
    }
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
    const state = get()
    const conversation = getActiveConversation(state)
    if (!conversation) return
    const generationStartedAt = Date.now()
    set({ generationClockMs: generationStartedAt })
    startGenerationClock()
    const prompt = conversation.draftPrompt.trim()
    const input: GenerateImageInput = {
      conversationId: conversation.id,
      prompt,
      model: conversation.model || getSelectedImageProfile(state.settings)?.defaultImageModel || DEFAULT_MODEL,
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
    const nextGenerationState = beginConversationGeneration(conversation.id, {
      generatingByConversation: state.generatingByConversation,
      startedAtByConversation: state.generationStartedAtByConversation,
      removedIndexesByRunId: state.removedGenerationIndexesByRunId
    }, generationStartedAt)
    set({
      generatingByConversation: nextGenerationState.generatingByConversation,
      generationStartedAtByConversation: nextGenerationState.startedAtByConversation,
      removedGenerationIndexesByRunId: nextGenerationState.removedIndexesByRunId
    })
    const titlePatch = conversation.title === '新会话' && prompt ? { title: prompt.length > 18 ? `${prompt.slice(0, 18)}...` : prompt } : null
    try {
      if (titlePatch) await get().updateActiveConversation(titlePatch)
      const resultPromise = pixaiApi.image.generate(input)
      void get().refreshConversationResults(conversation.id)
      const result = await resultPromise
      const runs = await pixaiApi.conversation.runs(conversation.id)
      const history = await pixaiApi.history.list({
        query: state.query,
        favoritesOnly: state.favoritesOnly,
        sort: 'newest'
      })
      const runsByConversation = { ...get().runsByConversation, [conversation.id]: runs }
      const runningRunIds = collectRunningRunIds(runsByConversation)
      const prunedGenerationState = pruneRemovedGenerationIndexesByRunId(runningRunIds, {
        generatingByConversation: get().generatingByConversation,
        startedAtByConversation: get().generationStartedAtByConversation,
        removedIndexesByRunId: get().removedGenerationIndexesByRunId
      })
      set({
        runsByConversation,
        history,
        removedGenerationIndexesByRunId: prunedGenerationState.removedIndexesByRunId
      })
      const durationText = result.run.durationMs != null ? `，用时 ${formatDuration(result.run.durationMs)}` : ''
      get().notify(result.canceled ? `已取消${durationText}` : result.errorMessage ? `生成失败：${result.errorMessage}${durationText}` : `生成完成${durationText}`)
      if (!result.canceled && !result.errorMessage) {
        await notifySuccessfulImages(result.items, get, durationText)
      }
    } catch (error) {
      get().notify(error instanceof ImageGenerationPreflightError ? error.message : error instanceof Error ? `生成失败：${error.message}` : '生成失败')
    } finally {
      const endedGenerationState = endConversationGeneration(conversation.id, {
        generatingByConversation: get().generatingByConversation,
        startedAtByConversation: get().generationStartedAtByConversation,
        removedIndexesByRunId: get().removedGenerationIndexesByRunId
      })
      set({
        generatingByConversation: endedGenerationState.generatingByConversation,
        generationStartedAtByConversation: endedGenerationState.startedAtByConversation,
        removedGenerationIndexesByRunId: endedGenerationState.removedIndexesByRunId
      })
      if (Object.keys(endedGenerationState.generatingByConversation).length === 0) stopGenerationClock()
    }
  },
  cancelGeneration: async (runId, requestIndex) => {
    if (!runId) return
    if (typeof requestIndex === 'number') {
      const nextGenerationState = markGenerationRequestRemoved(runId, requestIndex, {
        generatingByConversation: get().generatingByConversation,
        startedAtByConversation: get().generationStartedAtByConversation,
        removedIndexesByRunId: get().removedGenerationIndexesByRunId
      })
      set({
        generatingByConversation: nextGenerationState.generatingByConversation,
        generationStartedAtByConversation: nextGenerationState.startedAtByConversation,
        removedGenerationIndexesByRunId: nextGenerationState.removedIndexesByRunId
      })
    }
    await pixaiApi.image.cancel(runId, requestIndex)
  },
  refreshConversationResults: async (conversationId) => {
    const state = get()
    const runs = await pixaiApi.conversation.runs(conversationId)
    const history = await pixaiApi.history.list({
      query: state.query,
      favoritesOnly: state.favoritesOnly,
      sort: 'newest'
    })
    const runsByConversation = { ...get().runsByConversation, [conversationId]: runs }
    const runningRunIds = collectRunningRunIds(runsByConversation)
    const nextGenerationState = pruneRemovedGenerationIndexesByRunId(runningRunIds, {
      generatingByConversation: get().generatingByConversation,
      startedAtByConversation: get().generationStartedAtByConversation,
      removedIndexesByRunId: get().removedGenerationIndexesByRunId
    })
    set({
      runsByConversation,
      history,
      removedGenerationIndexesByRunId: nextGenerationState.removedIndexesByRunId
    })
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
    const item = findHistoryItem(get(), id)
    if (item?.conversationId && item.runId && typeof item.requestIndex === 'number') {
      const activeRun = get().runsByConversation[item.conversationId]?.find((run) => run.id === item.runId && run.status === 'running')
      if (activeRun) {
        const nextGenerationState = markGenerationRequestRemoved(item.runId, item.requestIndex, {
          generatingByConversation: get().generatingByConversation,
          startedAtByConversation: get().generationStartedAtByConversation,
          removedIndexesByRunId: get().removedGenerationIndexesByRunId
        })
        set({
          generatingByConversation: nextGenerationState.generatingByConversation,
          generationStartedAtByConversation: nextGenerationState.startedAtByConversation,
          removedGenerationIndexesByRunId: nextGenerationState.removedIndexesByRunId
        })
      }
    }
    await pixaiApi.history.delete(id)
    await get().reloadHistory()
    if (item?.conversationId) {
      const runs = await pixaiApi.conversation.runs(item.conversationId)
      set({ runsByConversation: { ...get().runsByConversation, [item.conversationId]: runs } })
    }
    get().notify('已删除历史项')
  },
  deleteHistoryItems: async (ids) => {
    const selectedIds = new Set(ids)
    if (selectedIds.size === 0) return
    const state = get()
    const affectedConversationIds = new Set(
      Array.from(selectedIds)
        .map((id) => findHistoryItem(state, id))
        .filter((entry): entry is ImageHistoryItem => Boolean(entry?.conversationId))
        .map((entry) => entry.conversationId as string)
    )
    const itemsById = new Map(
      Array.from(selectedIds)
        .map((id) => findHistoryItem(state, id))
        .filter((entry): entry is ImageHistoryItem => Boolean(entry))
        .map((entry) => [entry.id, entry])
    )
    const selectedHistoryItems = Array.from(itemsById.values())
    const activeItems = selectedHistoryItems.filter((entry) => entry.conversationId && entry.runId && typeof entry.requestIndex === 'number')
    let nextRemovedIndexesByRunId = { ...state.removedGenerationIndexesByRunId }
    let nextGeneratingByConversation = { ...state.generatingByConversation }
    let nextStartedAtByConversation = { ...state.generationStartedAtByConversation }
    let removedStateChanged = false

    for (const item of activeItems) {
      const activeRun = state.runsByConversation[item.conversationId as string]?.find((run) => run.id === item.runId && run.status === 'running')
      if (activeRun) {
        const nextGenerationState = markGenerationRequestRemoved(item.runId as string, item.requestIndex as number, {
          generatingByConversation: nextGeneratingByConversation,
          startedAtByConversation: nextStartedAtByConversation,
          removedIndexesByRunId: nextRemovedIndexesByRunId
        })
        nextGeneratingByConversation = nextGenerationState.generatingByConversation
        nextStartedAtByConversation = nextGenerationState.startedAtByConversation
        nextRemovedIndexesByRunId = nextGenerationState.removedIndexesByRunId
        removedStateChanged = true
      }
    }
    if (removedStateChanged) {
      set({
        generatingByConversation: nextGeneratingByConversation,
        generationStartedAtByConversation: nextStartedAtByConversation,
        removedGenerationIndexesByRunId: nextRemovedIndexesByRunId
      })
    }
    await pixaiApi.history.deleteMany(Array.from(selectedIds))
    await get().reloadHistory()
    const runsByConversation = { ...get().runsByConversation }
    for (const conversationId of affectedConversationIds) {
      runsByConversation[conversationId] = await pixaiApi.conversation.runs(conversationId)
    }
    set({ runsByConversation })
    get().notify(`已删除 ${selectedIds.size} 条历史项`)
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

function findHistoryItem(state: AppState, id: string): ImageHistoryItem | null {
  return state.history.find((item) => item.id === id)
    || Object.values(state.runsByConversation).flatMap((runs) => runs.flatMap((run) => run.items)).find((item) => item.id === id)
    || null
}

function getSelectedImageProfile(settings: ProviderSettings | null) {
  return settings?.profiles.find((profile) => profile.id === settings.selectedImageProfileId) || settings?.profiles[0] || null
}

async function notifySuccessfulImages(items: ImageHistoryItem[], get: () => AppState, durationText: string): Promise<void> {
  const successes = items.filter((item) => item.status === 'succeeded')
  if (successes.length === 0) return
  const state = get()
  if (!state.preferences?.notifyOnImageSuccess) return
  if (state.windowFocused) return
  if (state.preferences.notificationPermission !== 'granted') return
  await Promise.all(successes.map((item, index) => sendSystemNotification(
    successes.length > 1 ? `PixAI 图片生成完成 ${index + 1}/${successes.length}` : 'PixAI 图片生成完成',
    `${item.ratio} · ${item.quality}${durationText}`
  ).catch(() => undefined)))
}
