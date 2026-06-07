import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as platformModule from '../../lib/platform'
import { pixaiApi } from '../../services/app-api'
import { resetCanvasAssistantMessageFactoryForTests } from '../../services/canvas-assistant-messages'
import type { CanvasNodeData, CanvasProject, Conversation, ProviderSettings } from '../../shared/types'
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
    resetCanvasAssistantMessageFactoryForTests()
    useAppStore.setState({ activeConversationId: null })
    window.localStorage.setItem('pixai-canvas-guide-dismissed-v1', '1')
  })

  afterEach(() => {
    document.body.replaceChildren()
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

  it('renders the canvas assistant panel as a right-side canvas control', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project)

    expect(document.querySelector<HTMLElement>('aside.canvas-assistant-panel')?.textContent).toContain('画布助手')
    expect(assistantEditor()?.getAttribute('data-placeholder')).toContain('创建文本节点')
    expect(findButtonByText('发送给画布助手')).toBeTruthy()
    expect(document.body.textContent).toContain('创建文本节点：赛博城市夜景，然后生成')
    expect(document.body.textContent).not.toContain('视频')
    expect(document.body.textContent).not.toContain('音频')

    await unmountWorkspace(root, host)
  })

  it('shows canvas node suggestions after typing @ in the assistant input', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const textNode = canvasNode({ id: 'assistant-mention-text', type: 'text', content: '猫咪提示词' })
    const generateNode = canvasNode({ id: 'assistant-mention-generate', type: 'generate', x: 320 })
    const project = canvasProject({
      nodes: [
        { ...textNode, title: '主提示词' },
        { ...generateNode, title: '最终生成' }
      ]
    })
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project)
    const editor = assistantEditor()
    if (!editor) throw new Error('Canvas assistant editor was not found.')

    await act(async () => {
      setAssistantEditorText(editor, '连接@')
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const menu = document.querySelector<HTMLElement>('[data-canvas-assistant-mention-menu="true"]')
    expect(menu?.textContent).toContain('主提示词')
    expect(menu?.textContent).toContain('最终生成')
    await vi.waitFor(() => {
      expect(nodeElement(textNode.id)?.getAttribute('data-canvas-node-selected')).toBe('true')
    })
    expect(nodeElement(generateNode.id)?.getAttribute('data-canvas-node-selected')).toBeNull()

    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    })
    await vi.waitFor(() => {
      expect(nodeElement(generateNode.id)?.getAttribute('data-canvas-node-selected')).toBe('true')
    })
    expect(nodeElement(textNode.id)?.getAttribute('data-canvas-node-selected')).toBeNull()

    const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-canvas-assistant-mention-option="true"]'))
      .find((button) => button.textContent?.includes('主提示词'))
    await act(async () => {
      option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })

    expect(assistantEditor()?.textContent).toBe('连接@主提示词 ')
    expect(document.querySelector<HTMLElement>('[data-canvas-assistant-mention-token="true"]')?.getAttribute('contenteditable')).toBe('false')

    await act(async () => {
      const nextEditor = assistantEditor()
      if (!nextEditor) throw new Error('Canvas assistant editor was not found.')
      placeCaretAtEnd(nextEditor)
      nextEditor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))
    })

    expect(document.querySelector<HTMLElement>('[data-canvas-assistant-mention-token="true"]')).toBeNull()
    expect(assistantEditor()?.textContent).toBe('连接')

    await unmountWorkspace(root, host)
  })

  it('keeps selected mention labels readable while executing against the selected node id', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const firstTextNode = canvasNode({ id: 'canvas-node_ddd1ab0a-7ea8-4331-ace8-960310c43efa', type: 'text', content: '第一段提示词' })
    const secondTextNode = canvasNode({ id: 'canvas-node_eee1ab0a-7ea8-4331-ace8-960310c43efb', type: 'text', content: '第二段提示词', x: 320 })
    const project = canvasProject({ nodes: [firstTextNode, secondTextNode] })
    const enrich = vi.spyOn(pixaiApi.prompt, 'enrich').mockResolvedValue('丰富后的第二段提示词')
    const generateCanvasNode = vi.fn()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project, { generateCanvasNode })
    const editor = assistantEditor()
    if (!editor) throw new Error('Canvas assistant editor was not found.')

    await act(async () => {
      setAssistantEditorText(editor, '@')
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const menu = document.querySelector<HTMLElement>('[data-canvas-assistant-mention-menu="true"]')
    expect(menu?.textContent).toContain('文本节点 #1')
    expect(menu?.textContent).toContain('文本节点 #2')
    expect(menu?.textContent).not.toContain(firstTextNode.id)
    expect(menu?.textContent).not.toContain(secondTextNode.id)

    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    })
    await vi.waitFor(() => {
      expect(nodeElement(secondTextNode.id)?.getAttribute('data-canvas-node-selected')).toBe('true')
    })

    const secondOption = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-canvas-assistant-mention-option="true"]'))
      .find((button) => button.textContent?.includes('文本节点 #2'))
    await act(async () => {
      secondOption?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })
    const nextEditor = assistantEditor()
    if (!nextEditor) throw new Error('Canvas assistant editor was not found.')
    await act(async () => {
      nextEditor.appendChild(document.createTextNode('丰富这个节点 并生成一张图 测试'))
      placeCaretAtEnd(nextEditor)
      nextEditor.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(assistantEditor()?.textContent).toBe('@文本节点 #2 丰富这个节点 并生成一张图 测试')
    expect(assistantEditor()?.textContent).not.toContain(secondTextNode.id)

    await act(async () => {
      findButtonByText('发送给画布助手')?.click()
    })
    await vi.waitFor(() => {
      const node = useCanvasStore.getState().activeProject?.nodes.find((item) => item.id === secondTextNode.id)
      expect(node?.metadata.content).toBe('丰富后的第二段提示词')
    })

    expect(useCanvasStore.getState().activeProject?.nodes.find((node) => node.id === firstTextNode.id)?.metadata.content).toBe('第一段提示词')
    const activeProject = useCanvasStore.getState().activeProject
    const generateNode = activeProject?.nodes.find((node) => node.type === 'generate')
    expect(generateNode).toBeTruthy()
    expect(activeProject?.connections).toEqual([
      expect.objectContaining({
        fromNodeId: secondTextNode.id,
        toNodeId: generateNode?.id,
        kind: 'prompt'
      })
    ])
    expect(generateCanvasNode).toHaveBeenCalledWith(generateNode?.id)
    expect(enrich).toHaveBeenCalledWith({
      prompt: '第二段提示词',
      hasReferenceImages: false
    })
    expect(useCanvasStore.getState().assistantMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '@文本节点 #2 丰富这个节点 并生成一张图 测试' }),
      expect.objectContaining({ role: 'assistant', content: '已丰富文本节点内容。\n已从文本节点创建生成节点并运行。' })
    ]))
    expect(useCanvasStore.getState().assistantMessages.map((message) => message.content).join('\n')).not.toContain(secondTextNode.id)

    await unmountWorkspace(root, host)
  })

  it('resolves plain readable mention labels with duplicate node titles by ordinal', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const firstTextNode = canvasNode({ id: 'canvas-node_ddd1ab0a-7ea8-4331-ace8-960310c43efa', type: 'text', content: '第一段提示词' })
    const secondTextNode = canvasNode({ id: 'canvas-node_eee1ab0a-7ea8-4331-ace8-960310c43efb', type: 'text', content: '第二段提示词', x: 320 })
    const project = canvasProject({ nodes: [firstTextNode, secondTextNode] })
    const enrich = vi.spyOn(pixaiApi.prompt, 'enrich').mockResolvedValue('丰富后的第二段提示词')
    const generateCanvasNode = vi.fn()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project, { generateCanvasNode })

    await submitAssistantCommand('@文本节点 #2 丰富这个节点 并生成一张图 测试')

    await vi.waitFor(() => {
      const node = useCanvasStore.getState().activeProject?.nodes.find((item) => item.id === secondTextNode.id)
      expect(node?.metadata.content).toBe('丰富后的第二段提示词')
    })
    expect(useCanvasStore.getState().activeProject?.nodes.find((node) => node.id === firstTextNode.id)?.metadata.content).toBe('第一段提示词')
    const activeProject = useCanvasStore.getState().activeProject
    const generateNode = activeProject?.nodes.find((node) => node.type === 'generate')
    expect(generateNode).toBeTruthy()
    expect(activeProject?.connections).toEqual([
      expect.objectContaining({
        fromNodeId: secondTextNode.id,
        toNodeId: generateNode?.id,
        kind: 'prompt'
      })
    ])
    expect(generateCanvasNode).toHaveBeenCalledWith(generateNode?.id)
    expect(enrich).toHaveBeenCalledWith({
      prompt: '第二段提示词',
      hasReferenceImages: false
    })
    expect(useCanvasStore.getState().assistantMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '@文本节点 #2 丰富这个节点 并生成一张图 测试' }),
      expect.objectContaining({ role: 'assistant', content: '已丰富文本节点内容。\n已从文本节点创建生成节点并运行。' })
    ]))
    expect(useCanvasStore.getState().assistantMessages.map((message) => message.content).join('\n')).not.toContain(secondTextNode.id)

    await unmountWorkspace(root, host)
  })

  it('restores persisted canvas assistant messages after reopening the workspace', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project)

    await submitAssistantCommand('创建文本节点：重启后保留')
    await vi.waitFor(() => {
      expect(useCanvasStore.getState().assistantMessages).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '创建文本节点：重启后保留' }),
        expect.objectContaining({ role: 'assistant', content: '已创建文本节点。' })
      ]))
    })
    const reopenedProject = useCanvasStore.getState().activeProject!

    await unmountWorkspace(root, host)
    document.body.replaceChildren()
    resetCanvasStoreForTests()

    const reopened = await renderWorkspaceWithProject(currentConversation, reopenedProject)

    expect(document.body.textContent).toContain('创建文本节点：重启后保留')
    expect(document.body.textContent).toContain('已创建文本节点。')
    expect(reopenedProject.assistantMessages).toBeUndefined()
    expect(useCanvasStore.getState().assistantMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '创建文本节点：重启后保留' }),
      expect.objectContaining({ role: 'assistant', content: '已创建文本节点。' })
    ]))

    await unmountWorkspace(reopened.root, reopened.host)
  })

  it('keeps assistant message order and appends new messages after reopening the workspace', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project)

    await submitAssistantCommand('帮我随便弄一下')
    const reopenedProject = useCanvasStore.getState().activeProject!

    await unmountWorkspace(root, host)
    document.body.replaceChildren()
    resetCanvasStoreForTests()
    resetCanvasAssistantMessageFactoryForTests()

    const reopened = await renderWorkspaceWithProject(currentConversation, reopenedProject)

    await submitAssistantCommand('创建文本节点：重载后继续')

    const persisted = await pixaiApi.canvasAssistant.list(reopenedProject.id, { limit: 10 })
    expect(persisted.messages.map((message) => message.content)).toEqual([
      '帮我随便弄一下',
      expect.stringContaining('我还不能确定要执行哪些画布操作。'),
      '创建文本节点：重载后继续',
      '已创建文本节点。'
    ])
    expect(useCanvasStore.getState().assistantMessages.map((message) => message.content)).toEqual([
      '帮我随便弄一下',
      expect.stringContaining('我还不能确定要执行哪些画布操作。'),
      '创建文本节点：重载后继续',
      '已创建文本节点。'
    ])

    await unmountWorkspace(reopened.root, reopened.host)
  })

  it('loads older canvas assistant messages in pages', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    await pixaiApi.canvasAssistant.append(project.id, Array.from({ length: 55 }, (_, index) => ({
      id: `paged-message-${String(index + 1).padStart(3, '0')}`,
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `分页消息 ${String(index + 1).padStart(3, '0')}`,
      createdAt: new Date(Date.UTC(2026, 5, 7, 1, 0, index)).toISOString()
    })))

    const { root, host } = await renderWorkspaceWithProject(currentConversation, project)

    expect(document.body.textContent).toContain('分页消息 055')
    expect(document.body.textContent).toContain('加载更早消息')
    expect(document.body.textContent).not.toContain('分页消息 001')

    await act(async () => {
      findButtonByText('加载更早消息')?.click()
      await vi.waitFor(() => expect(document.body.textContent).toContain('分页消息 001'))
    })

    expect(useCanvasStore.getState().assistantMessages).toHaveLength(55)

    await unmountWorkspace(root, host)
  })

  it('clears assistant session messages without removing canvas nodes', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const textNode = canvasNode({ id: 'assistant-clear-keeps-node', type: 'text', content: 'kept prompt' })
    const project = canvasProject({ nodes: [textNode] })
    await pixaiApi.canvasAssistant.append(project.id, [
      { id: 'clear-user', role: 'user', content: '清空前用户消息', createdAt: '2026-06-07T00:00:00.000Z' },
      { id: 'clear-assistant', role: 'assistant', content: '清空前助手消息', createdAt: '2026-06-07T00:00:01.000Z' }
    ])
    const update = mockCanvasPersistence()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project, { skipPersistenceMock: true })

    expect(document.body.textContent).toContain('清空前用户消息')

    await act(async () => {
      findButtonByTitle('清空聊天记录')?.click()
      await vi.waitFor(() => expect(useCanvasStore.getState().assistantMessages).toEqual([]))
    })

    expect(document.body.textContent).not.toContain('清空前用户消息')
    expect(useCanvasStore.getState().activeProject?.nodes).toEqual([textNode])
    expect(update).not.toHaveBeenCalled()

    await unmountWorkspace(root, host)
  })

  it('keeps the viewport inside a flex column so canvas nodes are not clipped by a zero-height surface', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const textNode = canvasNode({ id: 'visible-layout-text', type: 'text', content: 'visible prompt' })
    const project = canvasProject({ nodes: [textNode], viewport: { x: 792, y: 394, k: 0.7 } })
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project)

    const viewport = document.querySelector<HTMLElement>('.canvas-viewport')
    expect(viewport?.parentElement?.className).toContain('flex')
    expect(viewport?.parentElement?.className).toContain('flex-col')
    expect(viewport?.parentElement?.className).toContain('min-h-0')
    expect(nodeElement(textNode.id)?.textContent).toContain('visible prompt')

    await unmountWorkspace(root, host)
  })

  it('deletes the selected canvas node with the Delete key without deleting while editing text', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const textNode = canvasNode({ id: 'keyboard-delete-text', type: 'text', content: 'editable prompt' })
    const generateNode = canvasNode({ id: 'keyboard-delete-generate', type: 'generate', x: 340 })
    const project = canvasProject({
      nodes: [textNode, generateNode],
      connections: [
        { id: 'keyboard-delete-connection', fromNodeId: textNode.id, toNodeId: generateNode.id, kind: 'prompt' }
      ]
    })
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project)

    await act(async () => {
      nodeElement(textNode.id)?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    const textEditor = nodeElement(textNode.id)?.querySelector<HTMLTextAreaElement>('textarea')
    await act(async () => {
      textEditor?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
    })
    expect(useCanvasStore.getState().activeProject?.nodes.map((node) => node.id)).toEqual([textNode.id, generateNode.id])

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.nodes.map((node) => node.id)).toEqual([generateNode.id]))
    })
    expect(useCanvasStore.getState().activeProject?.connections).toEqual([])
    expect(nodeElement(textNode.id)).toBeNull()

    await unmountWorkspace(root, host)
  })

  it('runs Canvas Agent tool calls with timeline and highlighted node focus', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const textNode = canvasNode({ id: 'agent-focus-text', type: 'text', content: '需要定位的提示词' })
    const project = canvasProject({ nodes: [textNode] })
    const runTurn = vi.spyOn(pixaiApi.canvasAgent, 'runTurn')
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'call-focus', name: 'focus_node', arguments: { node_id: textNode.id } }]
      })
      .mockResolvedValueOnce({
        content: '已定位到这个文本节点。',
        toolCalls: []
      })
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project, {
      settings: agentProviderSettings()
    })

    await submitAssistantCommand('定位这个文本节点')

    expect(runTurn).toHaveBeenCalledTimes(2)
    expect(runTurn.mock.calls[0][0].tools.some((tool) => tool.function.name === 'focus_node')).toBe(true)
    expect(document.querySelector<HTMLElement>('[data-canvas-agent-timeline="true"]')?.textContent).toContain('定位节点')
    expect(document.querySelector<HTMLElement>('[data-canvas-agent-timeline="true"]')?.textContent).toContain('已定位并高亮节点')
    expect(nodeElement(textNode.id)?.getAttribute('data-canvas-node-selected')).toBe('true')
    expect(nodeHighlightFrame(textNode.id)?.className).toContain('ring-primary/45')
    expect(useCanvasStore.getState().assistantMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', content: '已定位到这个文本节点。' })
    ]))

    await unmountWorkspace(root, host)
  })

  it('keeps Canvas Agent prompt enrichment as a pending change until the user applies it', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const textNode = canvasNode({ id: 'agent-pending-text', type: 'text', content: '原始提示词' })
    const project = canvasProject({ nodes: [textNode] })
    const enrich = vi.spyOn(pixaiApi.prompt, 'enrich').mockResolvedValue('丰富后的候选提示词')
    vi.spyOn(pixaiApi.canvasAgent, 'runTurn')
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'call-enrich', name: 'propose_prompt_enrichment', arguments: { node_id: textNode.id } }]
      })
      .mockResolvedValueOnce({
        content: '我准备好了一个候选提示词，等待你确认。',
        toolCalls: []
      })
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project, {
      settings: agentProviderSettings()
    })

    await submitAssistantCommand('丰富这个文本节点')

    expect(enrich).toHaveBeenCalledWith({
      prompt: '原始提示词',
      hasReferenceImages: false
    })
    expect(useCanvasStore.getState().activeProject?.nodes.find((node) => node.id === textNode.id)?.metadata.content).toBe('原始提示词')
    expect(document.querySelector<HTMLElement>('[data-canvas-agent-pending-changes="true"]')?.textContent).toContain('丰富后的候选提示词')
    expect(nodeHighlightFrame(textNode.id)?.className).toContain('ring-primary/45')

    await act(async () => {
      findPendingChangeButton('应用')?.click()
      await vi.waitFor(() => {
        expect(useCanvasStore.getState().activeProject?.nodes.find((node) => node.id === textNode.id)?.metadata.content).toBe('丰富后的候选提示词')
      })
    })

    expect(document.querySelector<HTMLElement>('[data-canvas-agent-pending-changes="true"]')).toBeNull()
    expect(nodeElement(textNode.id)?.getAttribute('data-canvas-node-selected')).toBe('true')

    await unmountWorkspace(root, host)
  })

  it('creates individual canvas node types from assistant commands', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project)

    await submitAssistantCommand('创建文本节点：单独提示词')
    await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(1))
    await submitAssistantCommand('创建生成节点：局部生成提示词')
    await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(2))
    await submitAssistantCommand('创建配置节点')
    await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(3))
    await submitAssistantCommand('新增批量节点：红色\n蓝色')
    await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(4))
    await submitAssistantCommand('创建结果节点')
    await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(5))

    const nodes = useCanvasStore.getState().activeProject!.nodes
    expect(nodes.map((node) => node.type)).toEqual(['text', 'generate', 'config', 'batch', 'result'])
    expect(nodes[0]).toMatchObject({ type: 'text', metadata: { content: '单独提示词' } })
    expect(nodes[1]).toMatchObject({ type: 'generate', metadata: { content: '局部生成提示词', status: 'idle' } })
    expect(nodes[3]).toMatchObject({ type: 'batch', metadata: { content: '红色 蓝色' } })
    expect(document.body.textContent).toContain('已创建结果节点。')

    await unmountWorkspace(root, host)
  })

  it('creates a text-to-generate chain from a canvas assistant command', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const notify = vi.fn()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project, { notify })

    await submitAssistantCommand('创建文本节点：赛博城市夜景，然后生成')
    await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(2))

    const activeProject = useCanvasStore.getState().activeProject!
    const textNode = activeProject.nodes.find((node) => node.type === 'text')
    const generateNode = activeProject.nodes.find((node) => node.type === 'generate')
    expect(textNode).toMatchObject({
      type: 'text',
      metadata: { content: '赛博城市夜景' }
    })
    expect(generateNode).toMatchObject({
      type: 'generate',
      metadata: { status: 'idle' }
    })
    expect(activeProject.connections).toEqual([
      expect.objectContaining({
        fromNodeId: textNode?.id,
        toNodeId: generateNode?.id,
        kind: 'prompt'
      })
    ])
    expect(document.body.textContent).toContain('已创建文本节点和生成节点，并建立提示词连接。')
    expect(notify).toHaveBeenCalledWith('已创建文本节点和生成节点，并建立提示词连接。')

    await unmountWorkspace(root, host)
  })

  it('runs the generated node when the assistant chain command asks to run', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const generateCanvasNode = vi.fn()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project, { generateCanvasNode })

    await submitAssistantCommand('创建文本节点：电影感猫咪肖像，然后生成并运行')
    await vi.waitFor(() => expect(generateCanvasNode).toHaveBeenCalledTimes(1))

    const generateNode = useCanvasStore.getState().activeProject?.nodes.find((node) => node.type === 'generate')
    expect(generateCanvasNode).toHaveBeenCalledWith(generateNode?.id)
    expect(document.body.textContent).toContain('已创建文本节点和生成节点，已连接并运行生成。')

    await unmountWorkspace(root, host)
  })

  it('updates the latest text node from a canvas assistant command', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const firstTextNode = canvasNode({ id: 'assistant-text-old', type: 'text', content: '旧提示词' })
    const latestTextNode = canvasNode({ id: 'assistant-text-latest', type: 'text', content: '待更新提示词', x: 300 })
    const project = canvasProject({ nodes: [firstTextNode, latestTextNode] })
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project)

    await submitAssistantCommand('修改最新文本为：柔和棚拍猫咪')
    await vi.waitFor(() => {
      const node = useCanvasStore.getState().activeProject?.nodes.find((item) => item.id === latestTextNode.id)
      expect(node?.metadata.content).toBe('柔和棚拍猫咪')
    })

    expect(useCanvasStore.getState().activeProject?.nodes.find((node) => node.id === firstTextNode.id)?.metadata.content).toBe('旧提示词')
    expect(document.body.textContent).toContain('已修改文本节点内容。')

    await unmountWorkspace(root, host)
  })

  it('connects existing nodes from a canvas assistant command', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const textNode = canvasNode({ id: 'assistant-connect-text', type: 'text', content: '连接提示词' })
    const generateNode = canvasNode({ id: 'assistant-connect-generate', type: 'generate', x: 320 })
    const project = canvasProject({ nodes: [textNode, generateNode] })
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project)

    await submitAssistantCommand('连接第1个文本到第1个生成')
    await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.connections).toHaveLength(1))

    expect(useCanvasStore.getState().activeProject?.connections[0]).toMatchObject({
      fromNodeId: textNode.id,
      toNodeId: generateNode.id,
      kind: 'prompt'
    })
    expect(document.body.textContent).toContain('已连接文本节点到生成节点。')

    await unmountWorkspace(root, host)
  })

  it('addresses named nodes from canvas assistant commands', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const generateCanvasNode = vi.fn()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project, { generateCanvasNode })

    await submitAssistantCommand('创建文本节点 @主提示词：电影感猫咪肖像')
    await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(1))
    await submitAssistantCommand('创建生成节点 @最终生成')
    await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(2))
    await submitAssistantCommand('连接@主提示词到@最终生成')
    await vi.waitFor(() => expect(useCanvasStore.getState().activeProject?.connections).toHaveLength(1))
    await submitAssistantCommand('修改@主提示词为：柔和棚拍猫咪')
    await vi.waitFor(() => {
      const node = useCanvasStore.getState().activeProject?.nodes.find((item) => item.title === '主提示词')
      expect(node?.metadata.content).toBe('柔和棚拍猫咪')
    })
    await submitAssistantCommand('运行@最终生成')
    await vi.waitFor(() => expect(generateCanvasNode).toHaveBeenCalledTimes(1))

    const activeProject = useCanvasStore.getState().activeProject!
    const textNode = activeProject.nodes.find((node) => node.title === '主提示词')
    const generateNode = activeProject.nodes.find((node) => node.title === '最终生成')
    expect(textNode).toMatchObject({ type: 'text', metadata: { content: '柔和棚拍猫咪' } })
    expect(generateNode).toMatchObject({ type: 'generate' })
    expect(activeProject.connections).toEqual([
      expect.objectContaining({
        fromNodeId: textNode?.id,
        toNodeId: generateNode?.id,
        kind: 'prompt'
      })
    ])
    expect(generateCanvasNode).toHaveBeenCalledWith(generateNode?.id)
    expect(document.body.textContent).toContain('已连接主提示词到最终生成。')
    expect(document.body.textContent).toContain('已修改主提示词内容。')
    expect(document.body.textContent).toContain('已运行最终生成。')

    await unmountWorkspace(root, host)
  })

  it('enriches a mentioned text node from a canvas assistant command', async () => {
    const currentConversation = conversation()
    const textNode = {
      ...canvasNode({ id: 'assistant-enrich-text', type: 'text', content: '生成一只猫' }),
      title: '主提示词'
    }
    const imageNode = canvasNode({ id: 'assistant-enrich-image', type: 'image', content: 'data:image/png;base64,cmVm', x: 320 })
    const project = canvasProject({ nodes: [textNode, imageNode] })
    const enrich = vi.spyOn(pixaiApi.prompt, 'enrich').mockResolvedValue('一只坐姿端正的橘猫，柔和棚拍光线')
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project)

    await submitAssistantCommand('@主提示词 丰富当前节点提示词')
    await vi.waitFor(() => {
      const node = useCanvasStore.getState().activeProject?.nodes.find((item) => item.id === textNode.id)
      expect(node?.metadata.content).toBe('一只坐姿端正的橘猫，柔和棚拍光线')
    })

    expect(enrich).toHaveBeenCalledWith({
      prompt: '生成一只猫',
      hasReferenceImages: true
    })
    expect(document.body.textContent).toContain('已丰富主提示词内容。')

    await unmountWorkspace(root, host)
  })

  it('explains invalid assistant connections without changing canvas nodes or connections', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const firstTextNode = canvasNode({ id: 'assistant-invalid-first-text', type: 'text', content: 'first' })
    const secondTextNode = canvasNode({ id: 'assistant-invalid-second-text', type: 'text', content: 'second', x: 260 })
    const project = canvasProject({ nodes: [firstTextNode, secondTextNode] })
    const update = mockCanvasPersistence()
    const notify = vi.fn()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project, {
      notify,
      skipPersistenceMock: true
    })

    await submitAssistantCommand('连接第1个文本到第2个文本')
    await vi.waitFor(() => expect(document.body.textContent).toContain('这两个节点不能建立有效连接。'))

    expect(update).not.toHaveBeenCalled()
    expect(useCanvasStore.getState().assistantMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '连接第1个文本到第2个文本' }),
      expect.objectContaining({ role: 'assistant', content: '这两个节点不能建立有效连接。' })
    ]))
    expect(useCanvasStore.getState().activeProject?.nodes).toEqual([firstTextNode, secondTextNode])
    expect(useCanvasStore.getState().activeProject?.connections).toEqual([])
    expect(notify).toHaveBeenCalledWith('这两个节点不能建立有效连接。')

    await unmountWorkspace(root, host)
  })

  it('runs the latest generate node and the workflow from assistant commands', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const firstGenerateNode = canvasNode({ id: 'assistant-run-first-generate', type: 'generate' })
    const latestGenerateNode = canvasNode({ id: 'assistant-run-latest-generate', type: 'generate', x: 340 })
    const project = canvasProject({ nodes: [firstGenerateNode, latestGenerateNode] })
    const generateCanvasNode = vi.fn()
    const runCanvasWorkflow = vi.fn()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project, {
      generateCanvasNode,
      runCanvasWorkflow
    })

    await submitAssistantCommand('运行最新生成')
    await vi.waitFor(() => expect(generateCanvasNode).toHaveBeenCalledWith(latestGenerateNode.id))

    await submitAssistantCommand('运行工作流')
    await vi.waitFor(() => expect(runCanvasWorkflow).toHaveBeenCalledTimes(1))

    expect(generateCanvasNode).not.toHaveBeenCalledWith(firstGenerateNode.id)
    expect(document.body.textContent).toContain('已运行生成节点。')
    expect(document.body.textContent).toContain('已运行 Canvas workflow。')

    await unmountWorkspace(root, host)
  })

  it('does not mutate canvas nodes or connections when the assistant command is unknown', async () => {
    const currentConversation = { ...conversation(), referenceImages: [] }
    const project = canvasProject()
    const update = mockCanvasPersistence()
    const { root, host } = await renderWorkspaceWithProject(currentConversation, project, { skipPersistenceMock: true })

    await submitAssistantCommand('帮我随便弄一下')
    await vi.waitFor(() => expect(document.body.textContent).toContain('我还不能确定要执行哪些画布操作。'))

    expect(update).not.toHaveBeenCalled()
    expect(useCanvasStore.getState().assistantMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '帮我随便弄一下' }),
      expect.objectContaining({ role: 'assistant', content: expect.stringContaining('我还不能确定要执行哪些画布操作。') })
    ]))
    expect(useCanvasStore.getState().activeProject?.nodes).toHaveLength(0)
    expect(useCanvasStore.getState().activeProject?.connections).toEqual([])
    expect(document.body.textContent).toContain('试试：创建文本节点：赛博城市夜景')

    await unmountWorkspace(root, host)
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

type WorkspaceRenderOptions = {
  notify?: ReturnType<typeof vi.fn>
  generateCanvasNode?: ReturnType<typeof vi.fn>
  runCanvasWorkflow?: ReturnType<typeof vi.fn>
  settings?: ProviderSettings | null
  skipPersistenceMock?: boolean
}

async function renderWorkspaceWithProject(
  currentConversation: Conversation,
  project: CanvasProject,
  options: WorkspaceRenderOptions = {}
): Promise<{ root: Root; host: HTMLDivElement }> {
  useAppStore.setState({
    activeConversationId: currentConversation.id,
    conversations: [currentConversation],
    notify: options.notify || vi.fn(),
    generateCanvasNode: options.generateCanvasNode || vi.fn(),
    runCanvasWorkflow: options.runCanvasWorkflow || vi.fn(),
    settings: options.settings ?? null
  })
  useCanvasStore.setState({
    activeProjectId: project.id,
    activeProject: project,
    projects: [{
      id: project.id,
      title: project.title,
      conversationId: project.conversationId,
      updatedAt: project.updatedAt,
      nodeCount: project.nodes.length
    }]
  })
  if (!options.skipPersistenceMock) mockCanvasPersistence()
  await act(async () => {
    await useCanvasStore.getState().loadAssistantMessages(project.id)
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<CanvasWorkspace />)
  })
  return { root, host }
}

function mockCanvasPersistence() {
  return vi.spyOn(pixaiApi.canvas, 'update').mockImplementation(async (_id, input) => ({
    ...useCanvasStore.getState().activeProject!,
    ...input,
    updatedAt: '2026-06-06T02:30:00.000Z'
  }))
}

async function unmountWorkspace(root: Root, host: HTMLElement): Promise<void> {
  await act(async () => {
    root.unmount()
  })
  host.remove()
}

function assistantEditor(): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>('aside.canvas-assistant-panel [data-canvas-assistant-editor="true"]')
}

async function submitAssistantCommand(command: string): Promise<void> {
  await waitForAssistantIdle()
  const input = assistantEditor()
  if (!input) throw new Error('Canvas assistant editor was not found.')
  await act(async () => {
    setAssistantEditorText(input, command)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    findButtonByText('发送给画布助手')?.click()
  })
  await waitForAssistantIdle()
}

function setAssistantEditorText(input: HTMLElement, value: string): void {
  input.textContent = value
  placeCaretAtEnd(input)
}

function placeCaretAtEnd(element: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

async function waitForAssistantIdle(): Promise<void> {
  await vi.waitFor(() => {
    expect(assistantEditor()?.getAttribute('aria-disabled')).toBe('false')
  })
}

function canvasNode(input: {
  id: string
  type: CanvasNodeData['type']
  content?: string
  x?: number
  y?: number
  metadata?: Partial<CanvasNodeData['metadata']>
}): CanvasNodeData {
  const width = input.type === 'generate' ? 300 : input.type === 'image' || input.type === 'result' ? 320 : 220
  const height = input.type === 'generate' ? 340 : input.type === 'image' || input.type === 'result' ? 260 : 140
  return {
    id: input.id,
    type: input.type,
    title: nodeTitle(input.type),
    position: { x: input.x || 0, y: input.y || 0 },
    width,
    height,
    metadata: {
      content: input.content || '',
      ...(input.type === 'generate' || input.type === 'result' ? { status: 'idle' as const } : {}),
      ...(input.metadata || {})
    }
  }
}

function nodeTitle(type: CanvasNodeData['type']): string {
  if (type === 'text') return '文本节点'
  if (type === 'generate') return '生成节点'
  if (type === 'config') return '配置节点'
  if (type === 'batch') return '批量节点'
  if (type === 'result') return '结果节点'
  return '图片节点'
}

function findButtonByTitle(title: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.title === title)
}

function findPendingChangeButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[data-canvas-agent-pending-changes="true"] button'))
    .find((button) => button.textContent?.includes(text))
}

function nodeElement(nodeId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-canvas-node-id="${nodeId}"]`)
}

function nodeHighlightFrame(nodeId: string): HTMLElement | null {
  return Array.from(nodeElement(nodeId)?.children || [])
    .find((child): child is HTMLElement => child instanceof HTMLElement && child.className.includes('grid h-full')) || null
}

function toolbarButton(nodeId: string, title: string): HTMLButtonElement | undefined {
  return Array.from(nodeElement(nodeId)?.querySelectorAll<HTMLButtonElement>('[data-canvas-node-action-toolbar="true"] button') || []).find((button) => button.title === title)
}

function agentProviderSettings(): ProviderSettings {
  return {
    profiles: [{
      id: 'agent-provider',
      name: 'Agent Provider',
      type: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      defaultImageModel: 'gpt-image-2',
      defaultPromptModel: 'gpt-4.1-mini',
      defaultAgentModel: 'gpt-4.1-mini',
      imageGenerationEndpoint: 'responses-api',
      enabledUsages: ['agent'],
      capabilities: ['canvas-agent', 'native-tool-calling'],
      apiKeyStored: true,
      insecureStorage: false,
      createdAt: '2026-06-07T00:00:00.000Z',
      updatedAt: '2026-06-07T00:00:00.000Z'
    }],
    selectedImageProfileId: '',
    selectedPromptProfileId: '',
    selectedAgentProfileId: 'agent-provider'
  }
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
