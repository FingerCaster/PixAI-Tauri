import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasShell } from './CanvasShell'
import { SharedLibraryShell } from './SharedLibraryShell'
import { WorkspaceShell } from './WorkspaceShell'
import { useAppStore } from '../../store/app-store'
import { resetCanvasStoreForTests, useCanvasStore } from '../../store/canvas-store'

describe('Shell layouts', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    resetCanvasStoreForTests()
    useAppStore.setState({
      conversations: [
        {
          id: 'layout-update-test',
          title: '测试会话',
          draftPrompt: '',
          model: 'gpt-image-1',
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
          createdAt: '2026-05-24T00:00:00.000Z',
          updatedAt: '2026-05-24T00:00:00.000Z'
        }
      ],
      activeConversationId: 'layout-update-test',
      generatingByConversation: {},
      darkMode: false,
      settingsVisible: true,
      view: 'workspace',
      settings: {
        profiles: [
          {
            id: 'default-openai-compatible',
            name: '默认服务',
            type: 'openai-compatible',
            baseUrl: 'https://example.com',
            defaultImageModel: 'gpt-image-1',
            defaultPromptModel: 'gpt-4.1',
            imageGenerationEndpoint: 'images-api',
            enabledUsages: ['image', 'prompt'],
            capabilities: ['text-to-image', 'prompt-assist', 'connection-test'],
            apiKeyStored: true,
            insecureStorage: false,
            createdAt: '2026-05-24T00:00:00.000Z',
            updatedAt: '2026-05-24T00:00:00.000Z'
          }
        ],
        selectedImageProfileId: 'default-openai-compatible',
        selectedPromptProfileId: 'default-openai-compatible'
      },
      appUpdate: {
        status: 'available',
        currentVersion: '0.0.2',
        platform: 'desktop',
        runtime: 'tauri',
        availableUpdate: {
          version: '0.0.3',
          date: '2026-05-24T00:00:00.000Z',
          notes: '测试更新',
          rawJson: {}
        },
        lastCheckedAt: '2026-05-24T00:00:00.000Z',
        errorMessage: null,
        downloadedBytes: null,
        contentLength: null
      }
    })
  })

  it('keeps the workspace parameter panel inside WorkspaceShell', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <WorkspaceShell onOpenGlobalSettings={vi.fn()}>
          <main />
        </WorkspaceShell>
      )
    })

    expect(findButtonByText('参数栏')).toBeTruthy()
    expect(document.body.textContent).toContain('新建会话')
    expect(document.body.textContent).toContain('测试会话')
    expect(document.body.textContent).toContain('基础参数')

    await act(async () => {
      findButtonByText('参数栏')?.click()
    })

    expect(useAppStore.getState().view).toBe('workspace')
    expect(useAppStore.getState().settingsVisible).toBe(false)
    expect(document.body.textContent).not.toContain('基础参数')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('filters hidden canvas conversations out of the workspace sidebar', async () => {
    useAppStore.setState({
      conversations: [
        ...useAppStore.getState().conversations,
        {
          ...useAppStore.getState().conversations[0],
          id: 'canvas-hidden-conversation',
          title: '隐藏 Canvas 会话'
        }
      ]
    })
    useCanvasStore.setState({
      projects: [
        {
          id: 'canvas-hidden-project',
          title: 'Canvas 项目',
          conversationId: 'canvas-hidden-conversation',
          updatedAt: '2026-06-05T00:10:00.000Z',
          nodeCount: 3
        }
      ]
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <WorkspaceShell onOpenGlobalSettings={vi.fn()}>
          <main />
        </WorkspaceShell>
      )
    })

    expect(document.body.textContent).toContain('测试会话')
    expect(document.body.textContent).not.toContain('隐藏 Canvas 会话')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('keeps canvas project navigation inside CanvasShell without a parameter panel button', async () => {
    useAppStore.setState({ view: 'canvas' })
    useCanvasStore.setState({
      activeProjectId: 'canvas-sidebar-project',
      projects: [
        {
          id: 'canvas-sidebar-project',
          title: '分镜画布',
          conversationId: 'canvas-hidden-conversation',
          updatedAt: '2026-06-05T00:11:00.000Z',
          nodeCount: 5
        }
      ]
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasShell onOpenGlobalSettings={vi.fn()}>
          <main />
        </CanvasShell>
      )
    })

    expect(findButtonByText('参数栏')).toBeUndefined()
    expect(document.body.textContent).toContain('Canvas 项目')
    expect(document.body.textContent).toContain('分镜画布')
    expect(document.body.textContent).toContain('新建 Canvas 项目')
    expect(document.body.textContent).not.toContain('新建会话')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('renders shared library pages without workspace or canvas sidebars', async () => {
    useAppStore.setState({ view: 'gallery' })
    useCanvasStore.setState({
      projects: [
        {
          id: 'canvas-sidebar-project',
          title: '分镜画布',
          conversationId: 'canvas-hidden-conversation',
          updatedAt: '2026-06-05T00:11:00.000Z',
          nodeCount: 5
        }
      ]
    })
    const onOpenGlobalSettings = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <SharedLibraryShell onOpenGlobalSettings={onOpenGlobalSettings}>
          <main>图库内容</main>
        </SharedLibraryShell>
      )
    })

    expect(document.body.textContent).toContain('图库内容')
    expect(document.body.textContent).not.toContain('新建会话')
    expect(document.body.textContent).not.toContain('新建 Canvas 项目')
    expect(document.body.textContent).not.toContain('测试会话')
    expect(document.body.textContent).not.toContain('分镜画布')

    await act(async () => {
      findButtonByTitle('全局设置')?.click()
    })
    expect(onOpenGlobalSettings).toHaveBeenCalledWith('general')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })
})

function findButtonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes(text))
}

function findButtonByTitle(title: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.title === title)
}
