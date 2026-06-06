import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as platformModule from '../../lib/platform'
import { pixaiApi } from '../../services/app-api'
import type { CanvasProject, Conversation } from '../../shared/types'
import { useAppStore } from '../../store/app-store'
import { resetCanvasStoreForTests, useCanvasStore } from '../../store/canvas-store'
import { CanvasWorkspace } from './CanvasWorkspace'

function conversation(): Conversation {
  return {
    id: 'canvas-reference-conversation',
    title: '参考图会话',
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
    stream: true,
    partialImages: 1,
    inputFidelity: null,
    maxRetries: 0,
    generationTimeoutSeconds: 300,
    autoSaveHistory: true,
    keepFailureDetails: true,
    referenceImages: [
      {
        id: 'reference-canvas-test',
        name: 'ref.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,cmVm',
        fileSizeBytes: 3,
        storagePath: null,
        createdAt: '2026-06-05T00:00:00.000Z'
      }
    ],
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z'
  }
}

function canvasProject(input: Partial<CanvasProject> = {}): CanvasProject {
  return {
    id: input.id || 'canvas-reference-project',
    title: input.title || 'Canvas 项目',
    conversationId: input.conversationId || 'canvas-reference-conversation',
    schemaVersion: 1,
    nodes: input.nodes || [],
    connections: input.connections || [],
    viewport: input.viewport || { x: 0, y: 0, k: 1 },
    createdAt: input.createdAt || '2026-06-05T00:00:00.000Z',
    updatedAt: input.updatedAt || '2026-06-05T00:00:00.000Z'
  }
}

describe('CanvasWorkspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetCanvasStoreForTests()
    useAppStore.setState({ activeConversationId: null })
    window.localStorage.setItem('pixai-canvas-guide-dismissed-v1', '1')
  })

  it('shows an empty canvas-project state without creating anything automatically', async () => {
    const createProject = vi.spyOn(pixaiApi.canvas, 'create')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })

    expect(document.body.textContent).toContain('还没有 Canvas 项目')
    expect(createProject).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('does not render a duplicate reference-image dropdown in the canvas toolbar', async () => {
    const currentConversation = conversation()
    const project = canvasProject()
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify: vi.fn()
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:05:00.000Z'
    }))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })

    expect(Array.from(document.querySelectorAll<HTMLButtonElement>('button')).some((button) => button.textContent?.includes('参考图'))).toBe(false)

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('adds a generate node from the canvas toolbar', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify: vi.fn()
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:06:00.000Z'
    }))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })
    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('生成'))?.click()
    })

    expect(useCanvasStore.getState().activeProject?.nodes[0]).toMatchObject({
      type: 'generate',
      metadata: { status: 'idle' }
    })

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('renders an image-generation dock without video or audio entries', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify: vi.fn()
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })

    for (const label of ['文本', '图片', '生成', '配置', '批量', '结果', '运行', '重置', '导入', '导出', '引导']) {
      expect(findButtonByText(label)).toBeTruthy()
    }
    expect(findButtonByText('视频')).toBeUndefined()
    expect(findButtonByText('音频')).toBeUndefined()
    expect(document.body.textContent).toContain('从这里开始生图')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('generates from a text node through the node action toolbar', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const textNode = {
      id: 'node-workspace-text-generate',
      type: 'text' as const,
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'neon city portrait' }
    }
    const project = canvasProject({ nodes: [textNode] })
    const generateCanvasNode = vi.fn()
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify: vi.fn(),
      generateCanvasNode
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 1 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-06T00:12:00.000Z'
    }))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })
    await act(async () => {
      nodeElement(textNode.id)?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    await act(async () => {
      toolbarButton(textNode.id, '从文本生成')?.click()
      await vi.waitFor(() => expect(generateCanvasNode).toHaveBeenCalled())
    })

    const activeProject = useCanvasStore.getState().activeProject!
    const generateNode = activeProject.nodes.find((node) => node.type === 'generate')
    expect(generateNode).toBeTruthy()
    expect(activeProject.connections).toEqual([
      expect.objectContaining({
        fromNodeId: textNode.id,
        toNodeId: generateNode?.id,
        kind: 'prompt'
      })
    ])
    expect(generateCanvasNode).toHaveBeenCalledWith(generateNode?.id)

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('creates a connected generate node from the connection create menu', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const textNode = {
      id: 'node-workspace-create-menu-text',
      type: 'text' as const,
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'empty-space connection prompt' }
    }
    const project = canvasProject({ nodes: [textNode], viewport: { x: 40, y: -20, k: 2 } })
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify: vi.fn()
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 1 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-06T00:22:00.000Z'
    }))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })
    await act(async () => {
      findButtonByTitle('从提示词端口连线')?.click()
    })
    await act(async () => {
      dispatchPointer(canvasSurface()!, 'pointerdown', { clientX: 460, clientY: 180 })
    })

    expect(document.querySelector<HTMLElement>('[data-canvas-connection-create-menu="true"]')?.textContent).toContain('生成节点')
    expect(document.body.textContent).not.toContain('视频')
    expect(document.body.textContent).not.toContain('音频')

    await act(async () => {
      findButtonByTitle('创建生成节点')?.click()
      await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(2))
    })

    const activeProject = useCanvasStore.getState().activeProject!
    const generateNode = activeProject.nodes.find((node) => node.type === 'generate')
    expect(generateNode).toMatchObject({
      type: 'generate',
      position: { x: 210, y: 100 },
      metadata: { content: '', status: 'idle' }
    })
    expect(activeProject.connections).toEqual([
      expect.objectContaining({
        fromNodeId: textNode.id,
        toNodeId: generateNode?.id,
        kind: 'prompt'
      })
    ])

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('shows generation context summary inside the canvas workspace', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const textNode = {
      id: 'node-workspace-summary-text',
      type: 'text' as const,
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'workspace prompt' }
    }
    const generateNode = {
      id: 'node-workspace-summary-generate',
      type: 'generate' as const,
      title: '生成节点',
      position: { x: 320, y: 24 },
      width: 300,
      height: 280,
      metadata: { content: '', status: 'idle' as const }
    }
    const project = canvasProject({
      nodes: [textNode, generateNode],
      connections: [
        { id: 'workspace-summary-prompt', fromNodeId: textNode.id, toNodeId: generateNode.id, kind: 'prompt' }
      ]
    })
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify: vi.fn()
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 2 }]
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })

    const generateElement = nodeElement(generateNode.id)
    expect(generateElement?.textContent).toContain('提示词 1')
    expect(generateElement?.textContent).toContain('参考图 0')
    expect(generateElement?.textContent).toContain('参数 0')
    expect(generateElement?.textContent).toContain('批量 0')
    expect(generateElement?.textContent).toContain('工作流请求 1')
    expect(generateElement?.textContent).not.toContain('缺少有效提示词')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('adds a local image node from the canvas toolbar', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const notify = vi.fn()
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:06:30.000Z'
    }))
    const pngBytes = pngHeaderBytes(640, 320)
    const storedPath = 'C:\\PixAI\\references\\local-cat.png'
    const storeDataUrlFile = vi.spyOn(platformModule, 'storeDataUrlFile').mockResolvedValue({
      path: storedPath,
      dataUrl: storedPath,
      mimeType: 'image/png',
      fileSizeBytes: pngBytes.length
    })
    vi.spyOn(platformModule, 'imageSourceForDisplaySync').mockImplementation((dataUrl, storagePath) => (
      storagePath ? `tauri-safe://${storagePath.replace(/\\/g, '/')}` : dataUrl
    ))
    vi.spyOn(platformModule, 'imageSourceForDisplay').mockImplementation(async (dataUrl, storagePath) => (
      storagePath ? `tauri-safe://${storagePath.replace(/\\/g, '/')}` : dataUrl
    ))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })
    const input = document.querySelector<HTMLInputElement>('input[accept="image/*"]')
    Object.defineProperty(input, 'files', {
      value: [new File([pngBytes], 'local-cat.png', { type: 'image/png' })],
      configurable: true
    })
    await act(async () => {
      input?.dispatchEvent(new Event('change', { bubbles: true }))
      await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(1))
    })
    expect(useCanvasStore.getState().activeProject?.nodes[0]).toMatchObject({
      type: 'image',
      title: 'local-cat',
      metadata: {
        mimeType: 'image/png',
        fileSizeBytes: pngBytes.length,
        content: storedPath,
        storagePath: storedPath,
        naturalWidth: 640,
        naturalHeight: 320
      }
    })
    expect(storeDataUrlFile).toHaveBeenCalledWith('references', 'local-cat.png', expect.stringMatching(/^data:image\/png;base64,/))
    expect(document.querySelector<HTMLElement>('[data-canvas-image-frame="true"]')?.className).toContain('h-full')
    expect(document.querySelector<HTMLImageElement>('img[alt="local-cat"]')?.className).toContain('object-contain')
    expect(notify).toHaveBeenCalledWith('本地图片已加入 Canvas：local-cat.png')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('opens the first-run guide and keeps the toolbar guide entry available after skipping', async () => {
    window.localStorage.removeItem('pixai-canvas-guide-dismissed-v1')
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const notify = vi.fn()
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })

    expect(document.body.textContent).toContain('Canvas 快速引导')
    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('跳过'))?.click()
    })
    expect(window.localStorage.getItem('pixai-canvas-guide-dismissed-v1')).toBe('1')
    expect(notify).toHaveBeenCalledWith('之后可点击工具栏“引导”重新查看 Canvas 用法')

    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('引导'))?.click()
    })
    expect(document.body.textContent).toContain('Canvas 快速引导')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('exports the active canvas project from the toolbar', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify: vi.fn()
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'exportProject').mockResolvedValue(project)
    const downloadTextFile = vi.spyOn(platformModule, 'downloadTextFile').mockResolvedValue()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })
    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('导出'))?.click()
    })

    expect(downloadTextFile).toHaveBeenCalledWith('Canvas 项目.json', JSON.stringify(project, null, 2), 'application/json')
    expect(useAppStore.getState().notify).toHaveBeenCalledWith('Canvas 项目已导出')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('does not render a duplicate project switcher inside the canvas header', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const currentProject = canvasProject()
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify: vi.fn()
    })
    useCanvasStore.setState({
      activeProjectId: currentProject.id,
      activeProject: currentProject,
      projects: [{ id: currentProject.id, title: currentProject.title, conversationId: currentProject.conversationId, updatedAt: currentProject.updatedAt, nodeCount: 0 }]
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })

    expect(Array.from(document.querySelectorAll<HTMLButtonElement>('button')).some((button) => button.textContent?.includes('项目'))).toBe(false)

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('imports a canvas project json file from the toolbar', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const importedProject = { ...project, id: 'canvas-imported-project', title: '外部项目（导入）' }
    const hiddenConversation = {
      ...currentConversation,
      id: 'canvas-hidden-import-conversation',
      title: 'Canvas hidden',
      referenceImages: []
    }
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify: vi.fn()
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.conversation, 'create').mockResolvedValue(hiddenConversation)
    vi.spyOn(platformModule, 'readTextFile').mockResolvedValue(JSON.stringify({ title: '外部项目' }))
    vi.spyOn(pixaiApi.canvas, 'importProject').mockResolvedValue(importedProject)
    vi.spyOn(pixaiApi.canvas, 'list').mockResolvedValue([
      { id: importedProject.id, title: importedProject.title, updatedAt: importedProject.updatedAt, nodeCount: 0 }
    ])
    vi.spyOn(pixaiApi.canvas, 'get').mockResolvedValue({ ...importedProject, conversationId: hiddenConversation.id })
    vi.spyOn(pixaiApi.conversation, 'runs').mockResolvedValue([])
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })
    const input = document.querySelector<HTMLInputElement>('input[accept="application/json,.json"]')
    Object.defineProperty(input, 'files', {
      value: [new File(['{}'], 'project.json', { type: 'application/json' })],
      configurable: true
    })
    await act(async () => {
      input?.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(pixaiApi.canvas.importProject).toHaveBeenCalledWith({ title: '外部项目' }, hiddenConversation.id)
    expect(useCanvasStore.getState().activeProjectId).toBe(importedProject.id)
    expect(useAppStore.getState().notify).toHaveBeenCalledWith('Canvas 项目已导入')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('adds advanced nodes and runs workflow from the canvas toolbar', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const runCanvasWorkflow = vi.fn()
    useAppStore.setState({
      activeConversationId: currentConversation.id,
      conversations: [currentConversation],
      notify: vi.fn(),
      runCanvasWorkflow
    })
    useCanvasStore.setState({
      activeProjectId: project.id,
      activeProject: project,
      projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, nodeCount: 0 }]
    })
    vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
      ...useCanvasStore.getState().activeProject!,
      ...input,
      updatedAt: '2026-06-05T00:09:00.000Z'
    }))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasWorkspace />)
    })
    await act(async () => {
      findButtonByText('配置')?.click()
    })
    await act(async () => {
      findButtonByText('批量')?.click()
    })
    await act(async () => {
      findButtonByText('结果')?.click()
    })
    await act(async () => {
      findButtonByText('运行')?.click()
    })

    expect(useCanvasStore.getState().activeProject?.nodes.map((node) => node.type)).toEqual(['config', 'batch', 'result'])
    expect(runCanvasWorkflow).toHaveBeenCalled()

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

function nodeElement(nodeId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-canvas-node-id="${nodeId}"]`)
}

function toolbarButton(nodeId: string, title: string): HTMLButtonElement | undefined {
  return Array.from(nodeElement(nodeId)?.querySelectorAll<HTMLButtonElement>('[data-canvas-node-action-toolbar="true"] button') || []).find((button) => button.title === title)
}

function canvasSurface(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.canvas-viewport > div.absolute.inset-0')
}

function dispatchPointer(element: HTMLElement, type: string, init: MouseEventInit = {}): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 10,
    clientY: 10,
    ...init
  })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  element.dispatchEvent(event)
}

function pngHeaderBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff
  ])
}
