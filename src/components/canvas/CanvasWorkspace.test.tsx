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

function canvasProject(): CanvasProject {
  return {
    id: 'canvas-reference-project',
    title: 'Canvas 项目',
    conversationId: 'canvas-reference-conversation',
    schemaVersion: 1,
    nodes: [],
    connections: [],
    viewport: { x: 0, y: 0, k: 1 },
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z'
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
    expect(notify).toHaveBeenCalledWith('图片已加入 Canvas')

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
      openDropdownTrigger(Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('高级')) || null)
    })
    await act(async () => {
      Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent?.includes('配置节点'))?.click()
    })
    await act(async () => {
      openDropdownTrigger(Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('高级')) || null)
    })
    await act(async () => {
      Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent?.includes('批量节点'))?.click()
    })
    await act(async () => {
      openDropdownTrigger(Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('高级')) || null)
    })
    await act(async () => {
      Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent?.includes('结果节点'))?.click()
    })
    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('运行'))?.click()
    })

    expect(useCanvasStore.getState().activeProject?.nodes.map((node) => node.type)).toEqual(['config', 'batch', 'result'])
    expect(runCanvasWorkflow).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })
})

function openDropdownTrigger(trigger: HTMLElement | null): void {
  if (!trigger) return
  trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
  trigger.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }))
  trigger.click()
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
