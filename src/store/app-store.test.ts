import { afterEach, describe, expect, it, vi } from 'vitest'
import { openAiCompatibleAdapter } from '../adapters/openai-compatible'
import * as platformModule from '../lib/platform'
import { __getSentNotificationsForTests, __setNotificationPermissionForTests, getProfileSecret } from '../lib/platform'
import { pixaiApi } from '../services/app-api'
import type { CanvasConnection, CanvasNodeData, CanvasProject, GenerateImageResult, GenerationRun, ImageHistoryItem } from '../shared/types'
import { resetCanvasStoreForTests, useCanvasStore } from './canvas-store'
import { useAppStore } from './app-store'

describe('useAppStore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetCanvasStoreForTests()
  })

  it('loads settings, templates, and creates an initial conversation', async () => {
    await useAppStore.getState().load()
    const state = useAppStore.getState()

    expect(state.settings?.profiles).toEqual([])
    expect(state.templates.length).toBeGreaterThan(0)
    expect(state.conversations).toHaveLength(1)
    expect(state.activeConversationId).toBe(state.conversations[0].id)
  })

  it('does not install or query the Codex Skill during normal app load', async () => {
    const statusSpy = vi.spyOn(pixaiApi.codexSkill, 'status')
    const installSpy = vi.spyOn(pixaiApi.codexSkill, 'install')

    await useAppStore.getState().load()

    expect(statusSpy).not.toHaveBeenCalled()
    expect(installSpy).not.toHaveBeenCalled()
  })

  it('loads app version info and starts one silent update check during normal app load', async () => {
    const versionSpy = vi.spyOn(pixaiApi.appUpdate, 'versionInfo').mockResolvedValue({
      version: '0.0.2',
      platform: 'desktop',
      runtime: 'tauri'
    })
    const checkSpy = vi.spyOn(pixaiApi.appUpdate, 'check').mockResolvedValue({
      currentVersion: '0.0.2',
      update: null
    })

    await useAppStore.getState().load()
    await vi.waitFor(() => expect(checkSpy).toHaveBeenCalledTimes(1))

    expect(versionSpy).toHaveBeenCalled()
    expect(useAppStore.getState().appUpdate).toMatchObject({
      status: 'upToDate',
      currentVersion: '0.0.2',
      availableUpdate: null,
      errorMessage: null
    })
  })

  it('stores available update metadata after a manual check', async () => {
    vi.spyOn(pixaiApi.appUpdate, 'check').mockResolvedValue({
      currentVersion: '0.0.2',
      update: {
        version: '0.0.3',
        date: '2026-05-24T00:00:00Z',
        notes: '更新说明',
        rawJson: {}
      }
    })

    await useAppStore.getState().checkForAppUpdate({ silent: false })

    expect(useAppStore.getState().appUpdate).toMatchObject({
      status: 'available',
      currentVersion: '0.0.2',
      availableUpdate: expect.objectContaining({ version: '0.0.3' }),
      errorMessage: null
    })
    expect(useAppStore.getState().toast).toBe('发现新版本 0.0.3')
  })

  it('keeps update check failures visible without clearing the workspace', async () => {
    vi.spyOn(pixaiApi.appUpdate, 'check').mockRejectedValue(new Error('updater endpoint missing'))

    await useAppStore.getState().checkForAppUpdate({ silent: false })

    expect(useAppStore.getState().appUpdate).toMatchObject({
      status: 'error',
      errorMessage: 'updater endpoint missing'
    })
    expect(useAppStore.getState().conversations).toHaveLength(1)
    expect(useAppStore.getState().toast).toBe('检查更新失败：updater endpoint missing')
  })

  it('toggles the workspace settings panel without changing the active view', () => {
    useAppStore.setState({ view: 'canvas', settingsVisible: true })

    useAppStore.getState().toggleSettings()

    expect(useAppStore.getState()).toMatchObject({
      view: 'canvas',
      settingsVisible: false
    })
  })

  it('applies prompt templates to the active conversation', async () => {
    await useAppStore.getState().load()
    const template = useAppStore.getState().templates[0]

    await useAppStore.getState().applyPromptTemplate(template)
    const conversation = useAppStore.getState().conversations[0]

    expect(conversation.draftPrompt).toBe(template.prompt)
    expect(conversation.title).toBe(template.title)
  })

  it('keeps the latest active conversation update when older saves resolve later', async () => {
    await useAppStore.getState().load()
    const conversation = useAppStore.getState().conversations[0]
    let resolveFirst: () => void = () => undefined
    let resolveSecond: () => void = () => undefined
    vi.spyOn(pixaiApi.conversation, 'update')
      .mockImplementationOnce((id, input) => new Promise((resolve) => {
        resolveFirst = () => resolve({
          ...conversation,
          ...input,
          id,
          draftPrompt: String(input.draftPrompt || ''),
          updatedAt: '2026-05-29T12:00:01.000Z'
        })
      }))
      .mockImplementationOnce((id, input) => new Promise((resolve) => {
        resolveSecond = () => resolve({
          ...conversation,
          ...input,
          id,
          draftPrompt: String(input.draftPrompt || ''),
          updatedAt: '2026-05-29T12:00:02.000Z'
        })
      }))

    const firstSave = useAppStore.getState().updateActiveConversation({ draftPrompt: '旧输入' })
    const secondSave = useAppStore.getState().updateActiveConversation({ draftPrompt: '最新输入' })

    expect(useAppStore.getState().conversations[0].draftPrompt).toBe('最新输入')

    resolveSecond()
    await secondSave
    expect(useAppStore.getState().conversations[0].draftPrompt).toBe('最新输入')

    resolveFirst()
    await firstSave
    expect(useAppStore.getState().conversations[0].draftPrompt).toBe('最新输入')
  })

  it('shows generation state immediately while image generation is pending', async () => {
    await useAppStore.getState().load()
    await useAppStore.getState().updateActiveConversation({ draftPrompt: '一只发光的玻璃风铃', n: 2 })
    const conversation = useAppStore.getState().conversations[0]
    const run: GenerationRun = {
      id: 'run-pending-test',
      conversationId: conversation.id,
      prompt: conversation.draftPrompt,
      model: conversation.model,
      ratio: conversation.ratio,
      size: conversation.size,
      quality: conversation.quality,
      n: 2,
      status: 'succeeded',
      durationMs: 1200,
      errorMessage: null,
      errorDetails: null,
      maxRetries: 0,
      retryAttempts: {},
      retryFailures: {},
      generationMode: 'text-to-image',
      referenceImages: [],
      createdAt: new Date().toISOString(),
      items: []
    }
    let resolveGenerate: (value: GenerateImageResult) => void = () => undefined
    vi.spyOn(pixaiApi.image, 'generate').mockImplementation(
      () => new Promise((resolve) => {
        resolveGenerate = resolve
      })
    )
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([])

    const generation = useAppStore.getState().generate()

    expect(useAppStore.getState().getConversationGenerationState(conversation.id)).toMatchObject({
      generating: true,
      activeCount: 1
    })

    resolveGenerate({ run, items: [] })
    await generation

    expect(useAppStore.getState().getConversationGenerationState(conversation.id)).toMatchObject({
      generating: false,
      activeCount: 0
    })
  })

  it('stores partial previews during generation and clears them after completion', async () => {
    await useAppStore.getState().load()
    await useAppStore.getState().updateActiveConversation({ title: '测试会话', draftPrompt: '一只玻璃风铃', n: 1 })
    const conversation = useAppStore.getState().conversations[0]
    const run: GenerationRun = {
      id: 'run-preview-store-test',
      conversationId: conversation.id,
      prompt: conversation.draftPrompt,
      model: conversation.model,
      ratio: conversation.ratio,
      size: conversation.size,
      quality: conversation.quality,
      n: 1,
      status: 'succeeded',
      durationMs: 1200,
      errorMessage: null,
      errorDetails: null,
      maxRetries: 0,
      retryAttempts: {},
      retryFailures: {},
      generationMode: 'text-to-image',
      referenceImages: [],
      createdAt: new Date().toISOString(),
      items: []
    }
    let resolveGenerate: (value: GenerateImageResult) => void = () => undefined
    vi.spyOn(pixaiApi.image, 'generate').mockImplementation(
      (_input, options) => {
        options?.onPartialImage?.({
          runId: run.id,
          requestIndex: 0,
          partialImageIndex: 0,
          dataUrl: 'data:image/png;base64,cHJldmlldw==',
          receivedAt: '2026-06-05T10:00:00.000Z'
        })
        return new Promise((resolve) => {
          resolveGenerate = resolve
        })
      }
    )
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([])

    const generation = useAppStore.getState().generate()

    expect(useAppStore.getState().generationPreviews[run.id]?.[0]).toMatchObject({
      dataUrl: 'data:image/png;base64,cHJldmlldw==',
      partialImageIndex: 0
    })

    resolveGenerate({ run, items: [] })
    await generation

    expect(useAppStore.getState().generationPreviews[run.id]).toBeUndefined()
  })

  it('shows preflight generation errors as direct toast messages', async () => {
    await useAppStore.getState().load()
    await useAppStore.getState().updateActiveConversation({ draftPrompt: '一座玻璃城市' })
    const conversation = useAppStore.getState().conversations[0]

    await useAppStore.getState().generate()

    expect(useAppStore.getState().toast).toBe('生成失败：请先添加 Provider。')
    expect(useAppStore.getState().runsByConversation[conversation.id] || []).toHaveLength(0)
    expect(await pixaiApi.history.list()).toHaveLength(0)
  })

  it('does not send a system notification while the notification setting is disabled', async () => {
    await prepareSuccessfulGeneration()
    useAppStore.getState().setWindowFocused(false)

    await useAppStore.getState().generate()

    expect(__getSentNotificationsForTests()).toHaveLength(0)
  })

  it('does not send a system notification while the app is focused', async () => {
    await prepareSuccessfulGeneration()
    await useAppStore.getState().updatePreferences({ notifyOnImageSuccess: true, notificationPermission: 'granted' })
    useAppStore.getState().setWindowFocused(true)

    await useAppStore.getState().generate()

    expect(__getSentNotificationsForTests()).toHaveLength(0)
  })

  it('sends one completion system notification while unfocused', async () => {
    await prepareSuccessfulGeneration()
    __setNotificationPermissionForTests('granted')
    await useAppStore.getState().updatePreferences({ notifyOnImageSuccess: true, notificationPermission: 'granted' })
    useAppStore.getState().setWindowFocused(false)

    await useAppStore.getState().generate()

    expect(__getSentNotificationsForTests()).toEqual([
      expect.objectContaining({ title: 'PixAI 图片生成完成' })
    ])
  })

  it('keeps the existing completion toast when notification permission is unavailable', async () => {
    await prepareSuccessfulGeneration()
    __setNotificationPermissionForTests('denied')
    await useAppStore.getState().updatePreferences({ notifyOnImageSuccess: true, notificationPermission: 'denied' })
    useAppStore.getState().setWindowFocused(false)

    await useAppStore.getState().generate()

    expect(__getSentNotificationsForTests()).toHaveLength(0)
    expect(useAppStore.getState().toast).toContain('生成完成')
  })

  it('sends a system notification for failed image generation while unfocused', async () => {
    await prepareSuccessfulGeneration()
    __setNotificationPermissionForTests('granted')
    await useAppStore.getState().updatePreferences({ notifyOnImageSuccess: true, notificationPermission: 'granted' })
    useAppStore.getState().setWindowFocused(false)
    vi.mocked(openAiCompatibleAdapter.generateImage).mockRejectedValue(new Error('upstream failed'))

    await useAppStore.getState().generate()

    expect(__getSentNotificationsForTests()).toEqual([
      expect.objectContaining({ title: 'PixAI 图片生成失败' })
    ])
    expect(useAppStore.getState().toast).toContain('生成失败')
  })

  it('deletes multiple history items through the batch API', async () => {
    await useAppStore.getState().load()
    const deleteManySpy = vi.spyOn(pixaiApi.history, 'deleteMany').mockResolvedValue(2)
    const deleteSpy = vi.spyOn(pixaiApi.history, 'delete')
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([])

    await useAppStore.getState().deleteHistoryItems(['history-1', 'history-2'])

    expect(deleteManySpy).toHaveBeenCalledWith(['history-1', 'history-2'])
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('retries a failed history item with its original generation parameters', async () => {
    await useAppStore.getState().load()
    const conversation = {
      ...useAppStore.getState().conversations[0],
      model: 'gpt-image-2',
      ratio: '16:9' as const,
      size: '1792x1008',
      quality: 'high' as const,
      maxRetries: 3
    }
    const failedItem: ImageHistoryItem = {
      id: 'history-retry-store-test',
      conversationId: conversation.id,
      runId: 'run-retry-source',
      prompt: '一座雨夜玻璃城市',
      model: 'gpt-image-2',
      ratio: '16:9',
      size: '1792x1008',
      quality: 'high',
      requestIndex: 0,
      durationMs: 1200,
      dataUrl: null,
      fileSizeBytes: null,
      status: 'failed',
      errorMessage: '图片请求失败，HTTP 状态码 502。',
      errorDetails: null,
      retryAttempt: 3,
      favorite: false,
      generationMode: 'text-to-image',
      referenceImages: [],
      createdAt: '2026-06-02T14:00:00.000Z'
    }
    const retryRun: GenerationRun = {
      id: 'run-retry-new',
      conversationId: conversation.id,
      prompt: failedItem.prompt,
      model: failedItem.model,
      ratio: failedItem.ratio,
      size: failedItem.size,
      quality: failedItem.quality,
      n: 1,
      status: 'succeeded',
      durationMs: 900,
      errorMessage: null,
      errorDetails: null,
      maxRetries: conversation.maxRetries,
      retryAttempts: {},
      retryFailures: {},
      generationMode: 'text-to-image',
      referenceImages: [],
      createdAt: '2026-06-02T14:01:00.000Z',
      items: []
    }
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      history: [failedItem],
      runsByConversation: {
        [conversation.id]: [{
          ...retryRun,
          id: 'run-retry-source',
          status: 'failed',
          items: [failedItem]
        }]
      }
    })
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate').mockResolvedValue({ run: retryRun, items: [] })
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([retryRun])
    vi.spyOn(pixaiApi.history, 'list').mockResolvedValue([])

    await useAppStore.getState().retryHistory(failedItem.id)

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: conversation.id,
        prompt: failedItem.prompt,
        model: failedItem.model,
        ratio: failedItem.ratio,
        size: failedItem.size,
        quality: failedItem.quality,
        n: 1,
        maxRetries: 3
      }),
      expect.objectContaining({ onPartialImage: expect.any(Function) })
    )
    expect(generateSpy.mock.calls[0][0]).not.toHaveProperty('origin')
    expect(useAppStore.getState().toast).toContain('重试完成')
  })

  it('creates a dedicated hidden conversation when opening canvas without an existing project', async () => {
    const workspaceConversation = {
      id: 'workspace-visible-conversation',
      title: '工作台会话',
      draftPrompt: '',
      model: 'gpt-image-2',
      ratio: '1:1' as const,
      size: '1024x1024',
      quality: 'high' as const,
      n: 1,
      outputFormat: 'png' as const,
      outputCompression: null,
      background: 'auto' as const,
      moderation: 'auto' as const,
      stream: false,
      partialImages: null,
      inputFidelity: null,
      maxRetries: 0,
      generationTimeoutSeconds: 300,
      autoSaveHistory: true,
      keepFailureDetails: true,
      referenceImages: [],
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z'
    }
    const hiddenConversation = {
      ...workspaceConversation,
      id: 'canvas-hidden-conversation',
      title: 'Canvas hidden'
    }
    const project = canvasProjectForAppStore(hiddenConversation.id, [], [])
    useAppStore.setState({
      conversations: [workspaceConversation],
      activeConversationId: workspaceConversation.id,
      activeCanvasConversationId: null,
      view: 'workspace',
      runsByConversation: {}
    })
    useCanvasStore.setState({ activeProjectId: null, activeProject: null, projects: [] })
    vi.spyOn(pixaiApi.conversation, 'create').mockResolvedValue(hiddenConversation)
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([])
    vi.spyOn(pixaiApi.canvas, 'create').mockResolvedValue(project)
    vi.spyOn(pixaiApi.canvas, 'list').mockResolvedValue([
      { id: project.id, title: project.title, conversationId: hiddenConversation.id, updatedAt: project.updatedAt, nodeCount: 0 }
    ])

    await useAppStore.getState().openCanvasWorkspace()

    expect(useAppStore.getState()).toMatchObject({
      activeConversationId: workspaceConversation.id,
      activeCanvasConversationId: hiddenConversation.id,
      view: 'canvas'
    })
    expect(useCanvasStore.getState().activeProject).toMatchObject({
      id: project.id,
      conversationId: hiddenConversation.id
    })
  })

  it('opens a canvas project without overwriting the active workspace conversation', async () => {
    const workspaceConversation = {
      id: 'workspace-visible-conversation',
      title: '工作台会话',
      draftPrompt: '',
      model: 'gpt-image-2',
      ratio: '1:1' as const,
      size: '1024x1024',
      quality: 'high' as const,
      n: 1,
      outputFormat: 'png' as const,
      outputCompression: null,
      background: 'auto' as const,
      moderation: 'auto' as const,
      stream: false,
      partialImages: null,
      inputFidelity: null,
      maxRetries: 0,
      generationTimeoutSeconds: 300,
      autoSaveHistory: true,
      keepFailureDetails: true,
      referenceImages: [],
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z'
    }
    const hiddenConversation = {
      ...workspaceConversation,
      id: 'canvas-hidden-conversation',
      title: 'Canvas hidden'
    }
    const targetProject = canvasProjectForAppStore(hiddenConversation.id, [], [])
    useAppStore.setState({
      conversations: [workspaceConversation, hiddenConversation],
      activeConversationId: workspaceConversation.id,
      activeCanvasConversationId: null,
      view: 'workspace',
      runsByConversation: {}
    })
    useCanvasStore.setState({
      activeProjectId: null,
      activeProject: null,
      projects: [{ id: targetProject.id, title: targetProject.title, conversationId: hiddenConversation.id, updatedAt: targetProject.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'get').mockResolvedValue(targetProject)
    vi.spyOn(pixaiApi.canvas, 'list').mockResolvedValue([
      { id: targetProject.id, title: targetProject.title, conversationId: hiddenConversation.id, updatedAt: targetProject.updatedAt, nodeCount: 0 }
    ])
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([])

    await useAppStore.getState().openCanvasProject(targetProject.id)

    expect(useAppStore.getState()).toMatchObject({
      activeConversationId: workspaceConversation.id,
      activeCanvasConversationId: hiddenConversation.id,
      view: 'canvas'
    })
  })

  it('adds a successful history image to the active canvas project through the reference bridge', async () => {
    await useAppStore.getState().load()
    const conversation = useAppStore.getState().conversations[0]
    const item = succeededHistoryItem({
      id: 'history-add-canvas-test',
      conversationId: conversation.id,
      dataUrl: 'data:image/png;base64,aGlzdG9yeQ==',
      fileSizeBytes: 7
    })
    const reference = {
      id: 'reference-from-history-test',
      name: 'history-add-canvas-test.png',
      mimeType: 'image/png',
      dataUrl: item.dataUrl || '',
      fileSizeBytes: item.fileSizeBytes || 0,
      storagePath: null,
      createdAt: '2026-06-05T00:00:00.000Z'
    }
    const project = {
      id: 'canvas-history-bridge',
      title: 'Canvas 项目',
      conversationId: conversation.id,
      schemaVersion: 1 as const,
      nodes: [],
      connections: [],
      viewport: { x: 0, y: 0, k: 1 },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z'
    }
    useAppStore.setState({
      activeConversationId: conversation.id,
      history: [item],
      runsByConversation: {
        [conversation.id]: [{
          id: 'run-history-bridge',
          conversationId: conversation.id,
          prompt: item.prompt,
          model: item.model,
          ratio: item.ratio,
          size: item.size,
          quality: item.quality,
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
          createdAt: item.createdAt,
          items: [item]
        }]
      }
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    const addFromHistoryMany = vi.spyOn(pixaiApi.reference, 'addFromHistoryMany').mockResolvedValue([reference])
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:06:00.000Z'
    }))

    await useAppStore.getState().addHistoryToCanvas(item.id)

    expect(addFromHistoryMany).toHaveBeenCalledWith(conversation.id, [item.id])
    expect(useAppStore.getState().conversations[0].referenceImages).toEqual([reference])
    expect(useAppStore.getState().view).toBe('canvas')
    expect(useCanvasStore.getState().activeProject?.nodes[0]).toMatchObject({
      type: 'image',
      metadata: {
        historyItemId: item.id,
        referenceImageId: reference.id,
        content: item.dataUrl
      }
    })
  })

  it('imports history images into the active canvas conversation instead of the workspace conversation', async () => {
    const workspaceConversation = {
      id: 'workspace-visible-conversation',
      title: '工作台会话',
      draftPrompt: '',
      model: 'gpt-image-2',
      ratio: '1:1' as const,
      size: '1024x1024',
      quality: 'high' as const,
      n: 1,
      outputFormat: 'png' as const,
      outputCompression: null,
      background: 'auto' as const,
      moderation: 'auto' as const,
      stream: false,
      partialImages: null,
      inputFidelity: null,
      maxRetries: 0,
      generationTimeoutSeconds: 300,
      autoSaveHistory: true,
      keepFailureDetails: true,
      referenceImages: [],
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z'
    }
    const hiddenConversation = {
      ...workspaceConversation,
      id: 'canvas-hidden-conversation',
      title: 'Canvas hidden'
    }
    const item = succeededHistoryItem({
      id: 'history-add-canvas-hidden-test',
      conversationId: workspaceConversation.id,
      dataUrl: 'data:image/png;base64,aGlzdG9yeQ==',
      fileSizeBytes: 7
    })
    const reference = {
      id: 'reference-from-hidden-canvas-test',
      name: 'history-add-canvas-hidden-test.png',
      mimeType: 'image/png',
      dataUrl: item.dataUrl || '',
      fileSizeBytes: item.fileSizeBytes || 0,
      storagePath: null,
      createdAt: '2026-06-05T00:00:00.000Z'
    }
    const project = canvasProjectForAppStore(hiddenConversation.id, [], [])
    useAppStore.setState({
      conversations: [workspaceConversation, hiddenConversation],
      activeConversationId: workspaceConversation.id,
      activeCanvasConversationId: hiddenConversation.id,
      history: [item],
      runsByConversation: {}
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, conversationId: hiddenConversation.id, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    const addFromHistoryMany = vi.spyOn(pixaiApi.reference, 'addFromHistoryMany').mockResolvedValue([reference])
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:06:00.000Z'
    }))

    await useAppStore.getState().addHistoryToCanvas(item.id)

    expect(addFromHistoryMany).toHaveBeenCalledWith(hiddenConversation.id, [item.id])
    expect(useAppStore.getState().activeConversationId).toBe(workspaceConversation.id)
  })

  it('adds a current reference image to the active canvas project', async () => {
    await useAppStore.getState().load()
    const reference = {
      id: 'reference-add-canvas-test',
      name: 'current-reference.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,cmVmZXJlbmNl',
      fileSizeBytes: 9,
      storagePath: null,
      createdAt: '2026-06-06T00:00:00.000Z'
    }
    const conversation = {
      ...useAppStore.getState().conversations[0],
      referenceImages: [reference]
    }
    const project = canvasProjectForAppStore(conversation.id, [], [])
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      activeCanvasConversationId: conversation.id,
      view: 'workspace'
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, conversationId: conversation.id, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-06T00:10:00.000Z'
    }))

    await useAppStore.getState().addReferenceToCanvas(reference.id)

    expect(useAppStore.getState()).toMatchObject({
      view: 'canvas',
      toast: '参考图已加入 Canvas：current-reference.png'
    })
    expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(1)
    expect(useCanvasStore.getState().activeProject?.nodes[0]).toMatchObject({
      type: 'image',
      title: 'current-reference',
      metadata: {
        content: reference.dataUrl,
        referenceImageId: reference.id,
        mimeType: 'image/png',
        fileSizeBytes: 9
      }
    })
  })

  it('does not duplicate the same reference image when adding it to canvas again', async () => {
    await useAppStore.getState().load()
    const reference = {
      id: 'reference-dedupe-canvas-test',
      name: 'dedupe.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,ZGVkdXBl',
      fileSizeBytes: 6,
      storagePath: null,
      createdAt: '2026-06-06T00:00:00.000Z'
    }
    const conversation = {
      ...useAppStore.getState().conversations[0],
      referenceImages: [reference]
    }
    const existingNode = canvasNode({
      id: 'node-existing-reference',
      type: 'image',
      content: reference.dataUrl,
      metadata: { referenceImageId: reference.id, mimeType: 'image/png', fileSizeBytes: 6 }
    })
    const project = canvasProjectForAppStore(conversation.id, [existingNode], [])
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      activeCanvasConversationId: conversation.id,
      view: 'workspace'
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, conversationId: conversation.id, updatedAt: project.updatedAt, nodeCount: 1 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-06T00:11:00.000Z'
    }))

    await useAppStore.getState().addReferenceToCanvas(reference.id)

    expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(1)
    expect(useCanvasStore.getState().activeProject?.nodes[0]?.id).toBe(existingNode.id)
  })

  it('uses a safe display source when adding a stored reference image to canvas', async () => {
    await useAppStore.getState().load()
    const reference = {
      id: 'reference-safe-source-canvas-test',
      name: 'stored.png',
      mimeType: 'image/png',
      dataUrl: 'C:\\stored\\references\\stored.png',
      fileSizeBytes: 12,
      storagePath: 'C:\\stored\\references\\stored.png',
      createdAt: '2026-06-06T00:00:00.000Z'
    }
    const conversation = {
      ...useAppStore.getState().conversations[0],
      referenceImages: [reference]
    }
    const project = canvasProjectForAppStore(conversation.id, [], [])
    vi.spyOn(platformModule, 'imageSourceForDisplay').mockResolvedValue('asset://localhost/C:/stored/references/stored.png')
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      activeCanvasConversationId: conversation.id,
      view: 'workspace'
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, conversationId: conversation.id, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-06T00:12:00.000Z'
    }))

    await useAppStore.getState().addReferenceToCanvas(reference.id)

    expect(platformModule.imageSourceForDisplay).toHaveBeenCalledWith(reference.dataUrl, reference.storagePath)
    expect(useCanvasStore.getState().activeProject?.nodes[0]?.metadata).toMatchObject({
      content: 'asset://localhost/C:/stored/references/stored.png',
      referenceImageId: reference.id,
      storagePath: reference.storagePath
    })
  })

  it('does not create a canvas node when the reference display source is unavailable', async () => {
    await useAppStore.getState().load()
    const reference = {
      id: 'reference-missing-source-canvas-test',
      name: 'missing.png',
      mimeType: 'image/png',
      dataUrl: 'C:\\stored\\references\\missing.png',
      fileSizeBytes: 12,
      storagePath: 'C:\\stored\\references\\missing.png',
      createdAt: '2026-06-06T00:00:00.000Z'
    }
    const conversation = {
      ...useAppStore.getState().conversations[0],
      referenceImages: [reference]
    }
    const project = canvasProjectForAppStore(conversation.id, [], [])
    vi.spyOn(platformModule, 'imageSourceForDisplay').mockResolvedValue(null)
    const update = vi.spyOn(pixaiApi.canvas, 'update')
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      activeCanvasConversationId: conversation.id,
      view: 'workspace'
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, conversationId: conversation.id, updatedAt: project.updatedAt, nodeCount: 0 }]
    })

    await useAppStore.getState().addReferenceToCanvas(reference.id)

    expect(update).not.toHaveBeenCalled()
    expect(useCanvasStore.getState().activeProject?.nodes).toEqual([])
    expect(useAppStore.getState().toast).toBe('图片内容不可用，无法加入 Canvas。')
  })

  it('generates from a canvas generate node using only connected prompt and references', async () => {
    await useAppStore.getState().load()
    const conversation = {
      ...useAppStore.getState().conversations[0],
      draftPrompt: 'classic workspace prompt',
      referenceImages: [
        {
          id: 'reference-connected',
          name: 'connected.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,cmVm',
          fileSizeBytes: 3,
          storagePath: null,
          createdAt: '2026-06-05T00:00:00.000Z'
        },
        {
          id: 'reference-unconnected',
          name: 'unconnected.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,bm8=',
          fileSizeBytes: 2,
          storagePath: null,
          createdAt: '2026-06-05T00:00:00.000Z'
        }
      ]
    }
    const textNode = canvasNode({ id: 'node-text', type: 'text', content: 'connected text prompt' })
    const imageNode = canvasNode({
      id: 'node-image',
      type: 'image',
      content: 'data:image/png;base64,cmVm',
      metadata: { referenceImageId: 'reference-connected', mimeType: 'image/png', fileSizeBytes: 3 }
    })
    const generateNode = canvasNode({ id: 'node-generate', type: 'generate', content: 'node local prompt' })
    const project = canvasProjectForAppStore(conversation.id, [textNode, imageNode, generateNode], [
      { id: 'connection-prompt', fromNodeId: textNode.id, toNodeId: generateNode.id, kind: 'prompt' },
      { id: 'connection-reference', fromNodeId: imageNode.id, toNodeId: generateNode.id, kind: 'reference-image' }
    ])
    const item = succeededHistoryItem({
      id: 'history-canvas-generate-success',
      conversationId: conversation.id,
      runId: 'run-canvas-generate-success',
      prompt: 'connected text prompt\n\nnode local prompt',
      dataUrl: 'data:image/png;base64,cmVzdWx0',
      fileSizeBytes: 6
    })
    const run = generationRunForAppStore({
      id: 'run-canvas-generate-success',
      conversationId: conversation.id,
      prompt: item.prompt,
      items: [item]
    })
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      history: [],
      runsByConversation: {}
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: project.nodes.length }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:07:00.000Z'
    }))
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate').mockImplementation(async (_input, options) => {
      options?.onPartialImage?.({
        runId: run.id,
        requestIndex: 0,
        partialImageIndex: 0,
        dataUrl: 'data:image/png;base64,cHJldmlldw==',
        receivedAt: '2026-06-05T10:00:00.000Z'
      })
      return { run, items: [item] }
    })
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([run])
    vi.spyOn(pixaiApi.history, 'list').mockResolvedValue([item])

    await useAppStore.getState().generateCanvasNode(generateNode.id)

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: conversation.id,
        prompt: 'connected text prompt\n\nnode local prompt',
        n: 1,
        referenceImageIds: ['reference-connected'],
        origin: {
          kind: 'canvas',
          canvasProjectId: project.id,
          canvasNodeId: generateNode.id
        }
      }),
      expect.objectContaining({ onPartialImage: expect.any(Function) })
    )
    const activeProject = useCanvasStore.getState().activeProject!
    expect(activeProject.nodes.find((node) => node.id === generateNode.id)).toMatchObject({
      metadata: {
        status: 'succeeded',
        historyItemId: item.id,
        runId: run.id
      }
    })
    expect(activeProject.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'result',
        metadata: expect.objectContaining({
          content: item.dataUrl,
          historyItemId: item.id,
          status: 'succeeded'
        })
      })
    ]))
    const resultNode = activeProject.nodes.find((node) => node.type === 'result' && node.metadata.historyItemId === item.id)
    expect(resultNode).toBeTruthy()
    expect(activeProject.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromNodeId: generateNode.id, toNodeId: resultNode?.id, kind: 'result' })
    ]))
    expect(useAppStore.getState().generationPreviews[run.id]).toBeUndefined()
  })

  it('imports unbound canvas image nodes before canvas generation', async () => {
    await useAppStore.getState().load()
    const conversation = { ...useAppStore.getState().conversations[0], referenceImages: [] }
    const imageNode = canvasNode({
      id: 'node-unbound-image',
      type: 'image',
      content: 'data:image/png;base64,aW1hZ2U=',
      metadata: { mimeType: 'image/png', fileSizeBytes: 5 }
    })
    const generateNode = canvasNode({ id: 'node-import-generate', type: 'generate', content: 'use imported image' })
    const project = canvasProjectForAppStore(conversation.id, [imageNode, generateNode], [
      { id: 'connection-import-reference', fromNodeId: imageNode.id, toNodeId: generateNode.id, kind: 'reference-image' }
    ])
    const importedReference = {
      id: 'reference-imported-canvas',
      name: 'node-unbound-image.png',
      mimeType: 'image/png',
      dataUrl: imageNode.metadata.content,
      fileSizeBytes: 5,
      storagePath: null,
      createdAt: '2026-06-05T00:00:00.000Z'
    }
    const item = succeededHistoryItem({
      id: 'history-imported-canvas-result',
      conversationId: conversation.id,
      runId: 'run-imported-canvas-result',
      prompt: 'use imported image',
      dataUrl: 'data:image/png;base64,cmVzdWx0',
      fileSizeBytes: 6
    })
    const run = generationRunForAppStore({
      id: 'run-imported-canvas-result',
      conversationId: conversation.id,
      prompt: item.prompt,
      referenceImages: [importedReference],
      items: [item]
    })
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      history: [],
      runsByConversation: {}
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: project.nodes.length }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:08:00.000Z'
    }))
    const importSpy = vi.spyOn(pixaiApi.reference, 'importPayloads').mockResolvedValue([importedReference])
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate').mockResolvedValue({ run, items: [item] })
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([run])
    vi.spyOn(pixaiApi.history, 'list').mockResolvedValue([item])

    await useAppStore.getState().generateCanvasNode(generateNode.id)

    expect(importSpy).toHaveBeenCalledWith(conversation.id, [
      expect.objectContaining({
        dataUrl: imageNode.metadata.content,
        mimeType: 'image/png'
      })
    ])
    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImageIds: [importedReference.id] }),
      expect.anything()
    )
    expect(useCanvasStore.getState().activeProject?.nodes.find((node) => node.id === imageNode.id)?.metadata.referenceImageId).toBe(importedReference.id)
  })

  it('imports storage-backed canvas image nodes before canvas generation', async () => {
    await useAppStore.getState().load()
    const conversation = { ...useAppStore.getState().conversations[0], referenceImages: [] }
    const storedDataUrl = 'data:image/png;base64,c3RvcmVk'
    const storedPath = 'C:\\PixAI\\references\\stored-local.png'
    const imageNode = canvasNode({
      id: 'node-storage-image',
      type: 'image',
      content: storedPath,
      metadata: {
        storagePath: storedPath,
        mimeType: 'image/png',
        fileSizeBytes: 6
      }
    })
    const generateNode = canvasNode({ id: 'node-storage-generate', type: 'generate', content: 'use storage image' })
    const project = canvasProjectForAppStore(conversation.id, [imageNode, generateNode], [
      { id: 'connection-storage-reference', fromNodeId: imageNode.id, toNodeId: generateNode.id, kind: 'reference-image' }
    ])
    const importedReference = {
      id: 'reference-storage-canvas',
      name: '图片节点.png',
      mimeType: 'image/png',
      dataUrl: storedDataUrl,
      fileSizeBytes: 6,
      storagePath: storedPath,
      createdAt: '2026-06-05T00:00:00.000Z'
    }
    const item = succeededHistoryItem({
      id: 'history-storage-canvas-result',
      conversationId: conversation.id,
      runId: 'run-storage-canvas-result',
      prompt: 'use storage image',
      dataUrl: 'data:image/png;base64,cmVzdWx0',
      fileSizeBytes: 6
    })
    const run = generationRunForAppStore({
      id: 'run-storage-canvas-result',
      conversationId: conversation.id,
      prompt: item.prompt,
      referenceImages: [importedReference],
      items: [item]
    })
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      history: [],
      runsByConversation: {}
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: project.nodes.length }]
    })
    const readLocalImageDataUrl = vi.spyOn(platformModule, 'readLocalImageDataUrl').mockResolvedValue(storedDataUrl)
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:08:30.000Z'
    }))
    const importSpy = vi.spyOn(pixaiApi.reference, 'importPayloads').mockResolvedValue([importedReference])
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate').mockResolvedValue({ run, items: [item] })
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([run])
    vi.spyOn(pixaiApi.history, 'list').mockResolvedValue([item])

    await useAppStore.getState().generateCanvasNode(generateNode.id)

    expect(readLocalImageDataUrl).toHaveBeenCalledWith(storedPath)
    expect(importSpy).toHaveBeenCalledWith(conversation.id, [
      expect.objectContaining({
        dataUrl: storedDataUrl,
        mimeType: 'image/png',
        storagePath: storedPath
      })
    ])
    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImageIds: [importedReference.id] }),
      expect.anything()
    )
    expect(useCanvasStore.getState().activeProject?.nodes.find((node) => node.id === imageNode.id)?.metadata.referenceImageId).toBe(importedReference.id)
  })

  it('passes canvas image masks with connected reference images', async () => {
    await useAppStore.getState().load()
    const maskDataUrl = 'data:image/png;base64,TUFTSw=='
    const referenceImage = {
      id: 'reference-mask-canvas',
      name: 'masked-ref.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,cmVm',
      fileSizeBytes: 3,
      storagePath: null,
      createdAt: '2026-06-06T00:00:00.000Z'
    }
    const conversation = { ...useAppStore.getState().conversations[0], referenceImages: [referenceImage] }
    const imageNode = canvasNode({
      id: 'node-masked-image',
      type: 'image',
      content: referenceImage.dataUrl,
      metadata: {
        referenceImageId: referenceImage.id,
        mimeType: 'image/png',
        fileSizeBytes: 3,
        maskDataUrl,
        maskUpdatedAt: '2026-06-06T00:00:00.000Z'
      }
    })
    const generateNode = canvasNode({ id: 'node-mask-generate', type: 'generate', content: 'edit masked area' })
    const project = canvasProjectForAppStore(conversation.id, [imageNode, generateNode], [
      { id: 'connection-mask-reference', fromNodeId: imageNode.id, toNodeId: generateNode.id, kind: 'reference-image' }
    ])
    const item = succeededHistoryItem({
      id: 'history-mask-result',
      conversationId: conversation.id,
      runId: 'run-mask-result',
      prompt: 'edit masked area',
      dataUrl: 'data:image/png;base64,cmVzdWx0',
      fileSizeBytes: 6
    })
    const run = generationRunForAppStore({
      id: 'run-mask-result',
      conversationId: conversation.id,
      prompt: item.prompt,
      referenceImages: [referenceImage],
      items: [item]
    })
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      history: [],
      runsByConversation: {}
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: project.nodes.length }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-06T00:01:00.000Z'
    }))
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate').mockResolvedValue({ run, items: [item] })
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([run])
    vi.spyOn(pixaiApi.history, 'list').mockResolvedValue([item])

    await useAppStore.getState().generateCanvasNode(generateNode.id)

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageIds: [referenceImage.id],
        referenceImageMasks: {
          [referenceImage.id]: maskDataUrl
        }
      }),
      expect.anything()
    )
  })

  it('does not generate canvas nodes without a prompt', async () => {
    await useAppStore.getState().load()
    const conversation = useAppStore.getState().conversations[0]
    const generateNode = canvasNode({ id: 'node-empty-generate', type: 'generate', content: '' })
    const project = canvasProjectForAppStore(conversation.id, [generateNode], [])
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 1 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:09:00.000Z'
    }))
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate')

    await useAppStore.getState().generateCanvasNode(generateNode.id)

    expect(generateSpy).not.toHaveBeenCalled()
    expect(useCanvasStore.getState().activeProject?.nodes[0]).toMatchObject({
      metadata: {
        status: 'failed',
        errorMessage: '请先连接文本节点或填写生成节点 prompt。'
      }
    })
  })

  it('applies connected canvas config nodes and writes success into result nodes', async () => {
    await useAppStore.getState().load()
    const conversation = {
      ...useAppStore.getState().conversations[0],
      ratio: '1:1' as const,
      size: '1024x1024',
      quality: 'low' as const
    }
    const textNode = canvasNode({ id: 'node-config-text', type: 'text', content: 'connected prompt' })
    const configNode = canvasNode({
      id: 'node-config',
      type: 'config',
      content: '',
      metadata: { ratio: '16:9', quality: 'high', n: 2 }
    })
    const generateNode = canvasNode({ id: 'node-config-generate', type: 'generate', content: 'local prompt' })
    const resultNode = canvasNode({ id: 'node-config-result', type: 'result', content: '', metadata: { status: 'idle' } })
    const project = canvasProjectForAppStore(conversation.id, [textNode, configNode, generateNode, resultNode], [
      { id: 'connection-prompt', fromNodeId: textNode.id, toNodeId: generateNode.id, kind: 'prompt' },
      { id: 'connection-config', fromNodeId: configNode.id, toNodeId: generateNode.id, kind: 'config' },
      { id: 'connection-result', fromNodeId: generateNode.id, toNodeId: resultNode.id, kind: 'result' }
    ])
    const item = succeededHistoryItem({
      id: 'history-config-result',
      conversationId: conversation.id,
      runId: 'run-config-result',
      prompt: 'connected prompt\n\nlocal prompt',
      dataUrl: 'data:image/png;base64,cmVzdWx0',
      fileSizeBytes: 6
    })
    const run = generationRunForAppStore({
      id: 'run-config-result',
      conversationId: conversation.id,
      prompt: item.prompt,
      items: [item]
    })
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      history: [],
      runsByConversation: {},
      notify: vi.fn()
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: project.nodes.length }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:10:00.000Z'
    }))
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate').mockResolvedValue({ run, items: [item] })
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([run])
    vi.spyOn(pixaiApi.history, 'list').mockResolvedValue([item])

    await useAppStore.getState().generateCanvasNode(generateNode.id)

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'connected prompt\n\nlocal prompt',
        ratio: '16:9',
        size: '1792x1008',
        quality: 'high',
        n: 2
      }),
      expect.anything()
    )
    const nodes = useCanvasStore.getState().activeProject!.nodes
    expect(nodes).toHaveLength(4)
    expect(nodes.find((node) => node.id === resultNode.id)).toMatchObject({
      type: 'result',
      metadata: {
        content: 'data:image/png;base64,cmVzdWx0',
        status: 'succeeded',
        historyItemId: item.id
      }
    })
  })

  it('keeps multiple canvas generation results when an explicit result node is connected', async () => {
    await useAppStore.getState().load()
    const conversation = {
      ...useAppStore.getState().conversations[0],
      ratio: '1:1' as const,
      size: '1024x1024',
      quality: 'high' as const
    }
    const configNode = canvasNode({
      id: 'node-multi-config',
      type: 'config',
      content: '',
      metadata: { n: 2 }
    })
    const generateNode = canvasNode({ id: 'node-multi-generate', type: 'generate', content: 'multi result prompt' })
    const resultNode = canvasNode({ id: 'node-multi-result', type: 'result', content: '', metadata: { status: 'idle' } })
    const project = canvasProjectForAppStore(conversation.id, [configNode, generateNode, resultNode], [
      { id: 'connection-multi-config', fromNodeId: configNode.id, toNodeId: generateNode.id, kind: 'config' },
      { id: 'connection-multi-result', fromNodeId: generateNode.id, toNodeId: resultNode.id, kind: 'result' }
    ])
    const firstItem = succeededHistoryItem({
      id: 'history-multi-first',
      conversationId: conversation.id,
      runId: 'run-multi-result',
      prompt: 'multi result prompt',
      requestIndex: 0,
      dataUrl: 'data:image/png;base64,Zmlyc3Q=',
      fileSizeBytes: 5
    })
    const secondItem = succeededHistoryItem({
      id: 'history-multi-second',
      conversationId: conversation.id,
      runId: 'run-multi-result',
      prompt: 'multi result prompt',
      requestIndex: 1,
      dataUrl: 'data:image/png;base64,c2Vjb25k',
      fileSizeBytes: 6
    })
    const run = generationRunForAppStore({
      id: 'run-multi-result',
      conversationId: conversation.id,
      prompt: 'multi result prompt',
      items: [firstItem, secondItem]
    })
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      history: [],
      runsByConversation: {},
      notify: vi.fn()
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: project.nodes.length }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-06T01:10:00.000Z'
    }))
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate').mockResolvedValue({ run, items: [firstItem, secondItem] })
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([run])
    vi.spyOn(pixaiApi.history, 'list').mockResolvedValue([secondItem, firstItem])

    await useAppStore.getState().generateCanvasNode(generateNode.id)

    expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({ n: 2 }), expect.anything())
    const activeProject = useCanvasStore.getState().activeProject!
    const resultNodes = activeProject.nodes.filter((node) => node.type === 'result')
    expect(resultNodes).toHaveLength(2)
    expect(resultNodes.map((node) => node.metadata.historyItemId)).toEqual(['history-multi-first', 'history-multi-second'])
    expect(resultNodes.map((node) => node.metadata.requestIndex)).toEqual([0, 1])
    expect(activeProject.connections.filter((connection) => connection.fromNodeId === generateNode.id && connection.kind === 'result')).toHaveLength(2)
  })

  it('runs every batch variant from a canvas generate node and records failed result nodes', async () => {
    await useAppStore.getState().load()
    const conversation = {
      ...useAppStore.getState().conversations[0],
      ratio: '1:1' as const,
      size: '1024x1024',
      quality: 'high' as const
    }
    const batchNode = canvasNode({
      id: 'node-batch-all',
      type: 'batch',
      content: ['variant one', 'variant two', 'variant three'].join('\n')
    })
    const configNode = canvasNode({
      id: 'node-batch-config',
      type: 'config',
      content: '',
      metadata: { n: 2 }
    })
    const generateNode = canvasNode({ id: 'node-batch-generate', type: 'generate', content: 'shared base prompt' })
    const project = canvasProjectForAppStore(conversation.id, [batchNode, configNode, generateNode], [
      { id: 'connection-batch-all', fromNodeId: batchNode.id, toNodeId: generateNode.id, kind: 'batch' },
      { id: 'connection-batch-config', fromNodeId: configNode.id, toNodeId: generateNode.id, kind: 'config' }
    ])
    const firstItems = [
      succeededHistoryItem({
        id: 'history-batch-1-1',
        conversationId: conversation.id,
        runId: 'run-batch-1',
        prompt: 'shared base prompt\n\nvariant one',
        requestIndex: 0,
        dataUrl: 'data:image/png;base64,YmF0Y2gxMQ==',
        fileSizeBytes: 8
      }),
      succeededHistoryItem({
        id: 'history-batch-1-2',
        conversationId: conversation.id,
        runId: 'run-batch-1',
        prompt: 'shared base prompt\n\nvariant one',
        requestIndex: 1,
        dataUrl: 'data:image/png;base64,YmF0Y2gxMg==',
        fileSizeBytes: 8
      })
    ]
    const secondSuccess = succeededHistoryItem({
      id: 'history-batch-2-1',
      conversationId: conversation.id,
      runId: 'run-batch-2',
      prompt: 'shared base prompt\n\nvariant two',
      requestIndex: 0,
      dataUrl: 'data:image/png;base64,YmF0Y2gyMQ==',
      fileSizeBytes: 8
    })
    const secondFailure = succeededHistoryItem({
      id: 'history-batch-2-2-failed',
      conversationId: conversation.id,
      runId: 'run-batch-2',
      prompt: 'shared base prompt\n\nvariant two',
      requestIndex: 1,
      dataUrl: null,
      fileSizeBytes: null,
      status: 'failed',
      errorMessage: 'variant two second image failed'
    })
    const thirdItems = [
      succeededHistoryItem({
        id: 'history-batch-3-1',
        conversationId: conversation.id,
        runId: 'run-batch-3',
        prompt: 'shared base prompt\n\nvariant three',
        requestIndex: 0,
        dataUrl: 'data:image/png;base64,YmF0Y2gzMQ==',
        fileSizeBytes: 8
      }),
      succeededHistoryItem({
        id: 'history-batch-3-2',
        conversationId: conversation.id,
        runId: 'run-batch-3',
        prompt: 'shared base prompt\n\nvariant three',
        requestIndex: 1,
        dataUrl: 'data:image/png;base64,YmF0Y2gzMg==',
        fileSizeBytes: 8
      })
    ]
    const firstRun = generationRunForAppStore({
      id: 'run-batch-1',
      conversationId: conversation.id,
      prompt: 'shared base prompt\n\nvariant one',
      items: firstItems
    })
    const secondRun = generationRunForAppStore({
      id: 'run-batch-2',
      conversationId: conversation.id,
      prompt: 'shared base prompt\n\nvariant two',
      items: [secondSuccess, secondFailure]
    })
    const thirdRun = generationRunForAppStore({
      id: 'run-batch-3',
      conversationId: conversation.id,
      prompt: 'shared base prompt\n\nvariant three',
      items: thirdItems
    })
    const notify = vi.fn()
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      history: [],
      runsByConversation: {},
      notify
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: project.nodes.length }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-06T01:20:00.000Z'
    }))
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate')
      .mockResolvedValueOnce({ run: firstRun, items: firstItems })
      .mockResolvedValueOnce({ run: secondRun, items: [secondSuccess, secondFailure], errorMessage: 'one image failed' })
      .mockResolvedValueOnce({ run: thirdRun, items: thirdItems })
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([thirdRun, secondRun, firstRun])
    vi.spyOn(pixaiApi.history, 'list').mockResolvedValue([...thirdItems, secondFailure, secondSuccess, ...firstItems])

    await useAppStore.getState().generateCanvasNode(generateNode.id)

    expect(generateSpy).toHaveBeenCalledTimes(3)
    expect(generateSpy.mock.calls.map(([input]) => input.prompt)).toEqual([
      'shared base prompt\n\nvariant one',
      'shared base prompt\n\nvariant two',
      'shared base prompt\n\nvariant three'
    ])
    expect(generateSpy.mock.calls.map(([input]) => input.n)).toEqual([2, 2, 2])
    const activeProject = useCanvasStore.getState().activeProject!
    const resultNodes = activeProject.nodes.filter((node) => node.type === 'result')
    expect(resultNodes).toHaveLength(6)
    expect(resultNodes.filter((node) => node.metadata.status === 'succeeded')).toHaveLength(5)
    const failedNode = resultNodes.find((node) => node.metadata.status === 'failed')
    expect(failedNode).toMatchObject({
      type: 'result',
      title: '批量 2 · #2 失败',
      metadata: {
        status: 'failed',
        errorMessage: 'variant two second image failed',
        historyItemId: secondFailure.id,
        runId: secondRun.id,
        requestIndex: 1,
        batchRootId: generateNode.id,
        batchIndex: 1,
        promptVariant: 'variant two'
      }
    })
    expect(activeProject.nodes.find((node) => node.id === generateNode.id)).toMatchObject({
      metadata: {
        status: 'failed',
        errorMessage: '批量生成部分失败：5 成功，1 失败'
      }
    })
    expect(notify).toHaveBeenLastCalledWith('Canvas 批量生成完成：5 成功，1 失败')
  })

  it('rejects canvas workflow runs that exceed the request budget before generating', async () => {
    await useAppStore.getState().load()
    const conversation = useAppStore.getState().conversations[0]
    const batchNode = canvasNode({
      id: 'node-budget-batch',
      type: 'batch',
      content: Array.from({ length: 9 }, (_, index) => `variant ${index}`).join('\n')
    })
    const generateNode = canvasNode({ id: 'node-budget-generate', type: 'generate', content: 'local prompt' })
    const project = canvasProjectForAppStore(conversation.id, [batchNode, generateNode], [
      { id: 'connection-budget-batch', fromNodeId: batchNode.id, toNodeId: generateNode.id, kind: 'batch' }
    ])
    const notify = vi.fn()
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      notify
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: project.nodes.length }]
    })
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate')

    await useAppStore.getState().runCanvasWorkflow()

    expect(generateSpy).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('Canvas workflow 请求数 9 超过上限 8')
  })

  it('enriches a canvas text node without changing the active conversation draft', async () => {
    await useAppStore.getState().load()
    const conversation = { ...useAppStore.getState().conversations[0], draftPrompt: 'classic draft' }
    const textNode = canvasNode({ id: 'node-enrich-text', type: 'text', content: '生成一只猫' })
    const imageNode = canvasNode({ id: 'node-enrich-image', type: 'image', content: 'data:image/png;base64,cmVm' })
    const project = canvasProjectForAppStore(conversation.id, [textNode, imageNode], [])
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      notify: vi.fn()
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: project.nodes.length }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:12:00.000Z'
    }))
    const enrich = vi.spyOn(pixaiApi.prompt, 'enrich').mockResolvedValue('一只坐姿端正的橘猫，柔和棚拍光线')

    await useAppStore.getState().enrichCanvasTextNode(textNode.id)

    expect(enrich).toHaveBeenCalledWith({
      prompt: '生成一只猫',
      hasReferenceImages: true
    })
    expect(useCanvasStore.getState().activeProject?.nodes[0].metadata.content).toBe('一只坐姿端正的橘猫，柔和棚拍光线')
    expect(useAppStore.getState().conversations[0].draftPrompt).toBe('classic draft')
    expect(useAppStore.getState().notify).toHaveBeenCalledWith('已丰富 Canvas 文本节点')
  })

  it('continues a canvas workflow after one generate node fails', async () => {
    await useAppStore.getState().load()
    const conversation = useAppStore.getState().conversations[0]
    const firstGenerate = canvasNode({ id: 'node-workflow-first', type: 'generate', content: 'first prompt' })
    const secondGenerate = canvasNode({ id: 'node-workflow-second', type: 'generate', content: 'second prompt' })
    const project = canvasProjectForAppStore(conversation.id, [firstGenerate, secondGenerate], [])
    const item = succeededHistoryItem({
      id: 'history-workflow-second',
      conversationId: conversation.id,
      runId: 'run-workflow-second',
      prompt: 'second prompt',
      dataUrl: 'data:image/png;base64,c2Vjb25k',
      fileSizeBytes: 6
    })
    const run = generationRunForAppStore({
      id: 'run-workflow-second',
      conversationId: conversation.id,
      prompt: item.prompt,
      items: [item]
    })
    const notify = vi.fn()
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      history: [],
      runsByConversation: {},
      notify
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: project.nodes.length }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:11:00.000Z'
    }))
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate')
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({ run, items: [item] })
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([run])
    vi.spyOn(pixaiApi.history, 'list').mockResolvedValue([item])

    await useAppStore.getState().runCanvasWorkflow()

    expect(generateSpy).toHaveBeenCalledTimes(2)
    const nodes = useCanvasStore.getState().activeProject!.nodes
    expect(nodes.find((node) => node.id === firstGenerate.id)).toMatchObject({
      metadata: { status: 'failed', errorMessage: 'first failed' }
    })
    expect(nodes.find((node) => node.id === secondGenerate.id)).toMatchObject({
      metadata: { status: 'succeeded', historyItemId: item.id }
    })
    expect(notify).toHaveBeenLastCalledWith('Canvas workflow 完成：1 成功，1 失败')
  })

  it('imports connected result nodes as references for downstream canvas generation', async () => {
    await useAppStore.getState().load()
    const conversation = { ...useAppStore.getState().conversations[0], referenceImages: [] }
    const resultNode = canvasNode({
      id: 'node-result-reference',
      type: 'result',
      content: 'data:image/png;base64,cmVm',
      metadata: { mimeType: 'image/png', fileSizeBytes: 3, historyItemId: 'history-upstream' }
    })
    const generateNode = canvasNode({ id: 'node-downstream-generate', type: 'generate', content: 'use result reference' })
    const project = canvasProjectForAppStore(conversation.id, [resultNode, generateNode], [
      { id: 'connection-result-reference', fromNodeId: resultNode.id, toNodeId: generateNode.id, kind: 'reference-image' }
    ])
    const importedReference = {
      id: 'reference-result-node',
      name: 'node-result-reference.png',
      mimeType: 'image/png',
      dataUrl: resultNode.metadata.content,
      fileSizeBytes: 3,
      storagePath: null,
      createdAt: '2026-06-05T00:00:00.000Z'
    }
    const item = succeededHistoryItem({
      id: 'history-downstream-result',
      conversationId: conversation.id,
      runId: 'run-downstream-result',
      prompt: 'use result reference',
      dataUrl: 'data:image/png;base64,cmVzdWx0',
      fileSizeBytes: 6
    })
    const run = generationRunForAppStore({
      id: 'run-downstream-result',
      conversationId: conversation.id,
      prompt: item.prompt,
      referenceImages: [importedReference],
      items: [item]
    })
    useAppStore.setState({
      conversations: [conversation],
      activeConversationId: conversation.id,
      history: [],
      runsByConversation: {}
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: project.nodes.length }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:12:00.000Z'
    }))
    const importSpy = vi.spyOn(pixaiApi.reference, 'importPayloads').mockResolvedValue([importedReference])
    const generateSpy = vi.spyOn(pixaiApi.image, 'generate').mockResolvedValue({ run, items: [item] })
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([run])
    vi.spyOn(pixaiApi.history, 'list').mockResolvedValue([item])

    await useAppStore.getState().generateCanvasNode(generateNode.id)

    expect(importSpy).toHaveBeenCalledWith(conversation.id, [
      expect.objectContaining({
        dataUrl: resultNode.metadata.content,
        mimeType: 'image/png'
      })
    ])
    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImageIds: [importedReference.id] }),
      expect.anything()
    )
    expect(useCanvasStore.getState().activeProject?.nodes.find((node) => node.id === resultNode.id)?.metadata.referenceImageId).toBe(importedReference.id)
  })
})

function canvasProjectForAppStore(conversationId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasProject {
  return {
    id: 'canvas-app-store-test',
    title: 'Canvas 项目',
    conversationId,
    schemaVersion: 1,
    nodes,
    connections,
    viewport: { x: 0, y: 0, k: 1 },
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z'
  }
}

function canvasNode({
  id,
  type,
  content,
  metadata = {}
}: {
  id: string
  type: CanvasNodeData['type']
  content: string
  metadata?: Partial<CanvasNodeData['metadata']>
}): CanvasNodeData {
  return {
    id,
    type,
    title: type === 'image' ? '图片节点' : type === 'generate' ? '生成节点' : '文本节点',
    position: { x: type === 'generate' ? 360 : 40, y: type === 'image' ? 260 : 40 },
    width: type === 'generate' ? 300 : type === 'image' ? 240 : 220,
    height: type === 'generate' ? 260 : type === 'image' ? 180 : 140,
    metadata: { content, ...metadata }
  }
}

function generationRunForAppStore(input: {
  id: string
  conversationId: string
  prompt: string
  referenceImages?: GenerationRun['referenceImages']
  items: ImageHistoryItem[]
}): GenerationRun {
  return {
    id: input.id,
    conversationId: input.conversationId,
    prompt: input.prompt,
    model: 'gpt-image-2',
    ratio: '1:1',
    size: '1024x1024',
    quality: 'high',
    n: 1,
    status: 'succeeded',
    durationMs: 1200,
    errorMessage: null,
    errorDetails: null,
    maxRetries: 0,
    retryAttempts: {},
    retryFailures: {},
    generationMode: input.referenceImages?.length ? 'image-to-image' : 'text-to-image',
    referenceImages: input.referenceImages || [],
    createdAt: '2026-06-05T00:00:00.000Z',
    items: input.items
  }
}

function succeededHistoryItem(overrides: Partial<ImageHistoryItem> = {}): ImageHistoryItem {
  return {
    id: 'history-success-test',
    conversationId: 'conversation-success-test',
    runId: 'run-success-test',
    prompt: '一张可加入 Canvas 的历史图',
    model: 'gpt-image-2',
    ratio: '1:1',
    size: '1024x1024',
    quality: 'high',
    requestIndex: 0,
    durationMs: 1200,
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    fileSizeBytes: 5,
    status: 'succeeded',
    errorMessage: null,
    errorDetails: null,
    retryAttempt: 0,
    favorite: false,
    generationMode: 'text-to-image',
    referenceImages: [],
    createdAt: '2026-06-05T00:00:00.000Z',
    ...overrides
  }
}

async function prepareSuccessfulGeneration(): Promise<void> {
  await useAppStore.getState().load()
  const settings = await pixaiApi.settings.upsertProfile({
    id: 'default-openai-compatible',
    apiKey: 'sk-123456789'
  })
  useAppStore.setState({ settings })
  await expect(getProfileSecret(settings.selectedImageProfileId)).resolves.toMatchObject({ value: 'sk-123456789' })
  await useAppStore.getState().updateActiveConversation({ draftPrompt: '一座玻璃城市', n: 2 })
  vi.spyOn(openAiCompatibleAdapter, 'generateImage').mockResolvedValue([
    { b64_json: 'aGVsbG8=' }
  ])
}
