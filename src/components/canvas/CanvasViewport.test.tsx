import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasConnection, CanvasNodeData } from '../../shared/types'
import { CanvasViewport } from './CanvasViewport'

describe('CanvasViewport', () => {
  it('commits zoom and reset controls', async () => {
    const onViewportCommit = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<CanvasViewport viewport={{ x: 12, y: 24, k: 1 }} onViewportCommit={onViewportCommit} />)
    })

    await act(async () => {
      findButtonByTitle('放大')?.click()
    })
    expect(onViewportCommit).toHaveBeenLastCalledWith({ x: 12, y: 24, k: 1.1 })

    await act(async () => {
      findButtonByTitle('重置视图')?.click()
    })
    expect(onViewportCommit).toHaveBeenLastCalledWith({ x: 0, y: 0, k: 1 })

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('renders nodes and commits connection and delete actions', async () => {
    const textNode: CanvasNodeData = {
      id: 'node-text',
      type: 'text',
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'hello canvas' }
    }
    const imageNode: CanvasNodeData = {
      id: 'node-image',
      type: 'image',
      title: '图片节点',
      position: { x: 20, y: 264 },
      width: 240,
      height: 180,
      metadata: { content: 'data:image/png;base64,AA==', mimeType: 'image/png', fileSizeBytes: 2 }
    }
    const generateNode: CanvasNodeData = {
      id: 'node-generate',
      type: 'generate',
      title: '生成节点',
      position: { x: 320, y: 24 },
      width: 300,
      height: 260,
      metadata: { content: '', status: 'idle' }
    }
    const connections: CanvasConnection[] = [
      { id: 'connection-one', fromNodeId: textNode.id, toNodeId: generateNode.id, kind: 'prompt' }
    ]
    const onViewportCommit = vi.fn()
    const onConnectionAdd = vi.fn()
    const onConnectionDelete = vi.fn()
    const onNodeDelete = vi.fn()
    const onTextNodeEnrich = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[textNode, generateNode, imageNode]}
          connections={connections}
          onViewportCommit={onViewportCommit}
          onConnectionAdd={onConnectionAdd}
          onConnectionDelete={onConnectionDelete}
          onNodeDelete={onNodeDelete}
          onTextNodeEnrich={onTextNodeEnrich}
        />
      )
    })

    expect(document.querySelector('textarea')?.value).toBe('hello canvas')
    expect(document.querySelector('img')?.getAttribute('alt')).toBe('图片节点')
    expect(document.querySelector<HTMLElement>('[data-canvas-image-frame="true"]')?.className).toContain('h-full')
    expect(document.querySelector('img')?.className).toContain('object-contain')
    expect(document.querySelectorAll('path.cursor-pointer')).toHaveLength(1)
    expect(document.querySelector('path.cursor-pointer')?.getAttribute('stroke')).toBe('currentColor')
    expect(document.querySelector('path.cursor-pointer')?.getAttribute('d')).toBe('M 232 42 C 304 42, 256 42, 328 42')
    expect(document.querySelector('svg')?.textContent).toContain('提示词')
    expect(document.querySelector('svg')?.classList.contains('text-primary')).toBe(true)

    await act(async () => {
      document.querySelector('textarea')?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120 }))
    })
    expect(onViewportCommit).not.toHaveBeenCalled()

    await act(async () => {
      findButtonByTitle('从提示词端口连线')?.click()
    })
    await act(async () => {
      findButtonByTitle('连接为提示词')?.click()
    })
    expect(onConnectionAdd).toHaveBeenCalledWith(textNode.id, generateNode.id)

    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('丰富'))?.click()
    })
    expect(onTextNodeEnrich).toHaveBeenCalledWith(textNode.id)

    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('放大'))?.click()
    })
    expect(document.querySelector<HTMLTextAreaElement>('[aria-label="Canvas 文本节点编辑器"] textarea')?.value).toBe('hello canvas')

    await act(async () => {
      findButtonByTitle('查看大图')?.click()
    })
    const imagePreview = document.querySelector<HTMLElement>('[aria-label="Canvas 图片预览"]')
    expect(imagePreview?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA==')
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="关闭图片预览"]')?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    })
    expect(document.querySelector<HTMLElement>('[aria-label="Canvas 图片预览"]')).toBeNull()

    await act(async () => {
      document.querySelector<HTMLElement>('path.cursor-pointer')?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    await act(async () => {
      findButtonByTitle('删除连线')?.click()
    })
    expect(onConnectionDelete).toHaveBeenCalledWith('connection-one')

    await act(async () => {
      document.querySelector<HTMLElement>('[style*="left: 20px"]')?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    await act(async () => {
      findButtonByTitle('删除节点')?.click()
    })
    expect(onNodeDelete).toHaveBeenCalledWith(textNode.id)

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('shows prompt enrich loading only on the active text node', async () => {
    const firstTextNode: CanvasNodeData = {
      id: 'node-enrich-first-text',
      type: 'text',
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'first prompt' }
    }
    const secondTextNode: CanvasNodeData = {
      id: 'node-enrich-second-text',
      type: 'text',
      title: '文本节点',
      position: { x: 280, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'second prompt' }
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[firstTextNode, secondTextNode]}
          onViewportCommit={vi.fn()}
          promptEnriching
          promptEnrichingNodeId={secondTextNode.id}
        />
      )
    })

    const firstButton = nodeElement(firstTextNode.id)?.querySelector<HTMLButtonElement>('button[title="丰富提示词"]')
    const secondButton = nodeElement(secondTextNode.id)?.querySelector<HTMLButtonElement>('button[title="丰富提示词"]')
    expect(firstButton?.disabled).toBe(true)
    expect(secondButton?.disabled).toBe(true)
    expect(firstButton?.querySelector('svg')?.className.baseVal).not.toContain('animate-spin')
    expect(secondButton?.querySelector('svg')?.className.baseVal).toContain('animate-spin')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('keeps node actions reachable with long image titles', async () => {
    const textNode: CanvasNodeData = {
      id: 'node-long-title-text',
      type: 'text',
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'prompt' }
    }
    const imageNode: CanvasNodeData = {
      id: 'node-long-title-image',
      type: 'image',
      title: 'history_416b7ff0637872ca11f7c1c2a66054ddb10c2ddbdbb9019ab1b316333e5b5c0a',
      position: { x: 280, y: 24 },
      width: 240,
      height: 180,
      metadata: { content: 'data:image/png;base64,AA==', mimeType: 'image/png', fileSizeBytes: 2 }
    }
    const onNodeDelete = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[textNode, imageNode]}
          onViewportCommit={vi.fn()}
          onNodeDelete={onNodeDelete}
        />
      )
    })

    expect(findButtonsByTitle('从提示词端口连线')).toHaveLength(1)
    expect(findButtonsByTitle('从参考图端口连线')).toHaveLength(1)
    expect(findButtonsByTitle('删除节点')).toHaveLength(2)
    const imageElement = document.querySelector<HTMLElement>('[data-canvas-node-id="node-long-title-image"]')
    const imageTitle = imageElement?.querySelector<HTMLElement>('span.truncate')
    expect(imageElement?.style.width).toBe('320px')
    expect(imageElement?.style.height).toBe('260px')
    expect(imageTitle?.className).toContain('truncate')
    expect(imageTitle?.title).toBe(imageNode.title)
    expect(imageTitle?.textContent).toContain('...')
    expect(imageTitle?.textContent).not.toBe(imageNode.title)
    expect(document.querySelector<HTMLImageElement>('[data-canvas-node-id="node-long-title-image"] img')?.alt).toBe(imageNode.title)
    expect(document.querySelector<HTMLImageElement>('[data-canvas-node-id="node-long-title-image"] img')?.className).toContain('object-contain')
    expect(document.querySelector<HTMLElement>('[data-canvas-image-body="true"]')).toBeTruthy()

    await act(async () => {
      findButtonsByTitle('删除节点')[1]?.click()
    })
    expect(onNodeDelete).toHaveBeenCalledWith(imageNode.id)

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('runs node actions from the floating action toolbar', async () => {
    const textNode: CanvasNodeData = {
      id: 'node-toolbar-text',
      type: 'text',
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'toolbar prompt' }
    }
    const emptyTextNode: CanvasNodeData = {
      id: 'node-toolbar-empty-text',
      type: 'text',
      title: '空文本节点',
      position: { x: 20, y: 224 },
      width: 220,
      height: 140,
      metadata: { content: '   ' }
    }
    const imageNode: CanvasNodeData = {
      id: 'node-toolbar-image',
      type: 'image',
      title: '图片节点',
      position: { x: 300, y: 24 },
      width: 240,
      height: 180,
      metadata: { content: 'data:image/png;base64,AA==', mimeType: 'image/png', fileSizeBytes: 2 }
    }
    const resultNode: CanvasNodeData = {
      id: 'node-toolbar-result',
      type: 'result',
      title: '结果节点',
      position: { x: 580, y: 24 },
      width: 260,
      height: 220,
      metadata: {
        content: 'data:image/png;base64,cmVzdWx0',
        status: 'succeeded',
        mimeType: 'image/png',
        fileSizeBytes: 6
      }
    }
    const failedGenerateNode: CanvasNodeData = {
      id: 'node-toolbar-generate-failed',
      type: 'generate',
      title: '失败生成节点',
      position: { x: 860, y: 24 },
      width: 300,
      height: 260,
      metadata: { content: 'retry prompt', status: 'failed', errorMessage: 'failed once' }
    }
    const runningGenerateNode: CanvasNodeData = {
      id: 'node-toolbar-generate-running',
      type: 'generate',
      title: '运行中生成节点',
      position: { x: 1180, y: 24 },
      width: 300,
      height: 260,
      metadata: { content: 'running prompt', status: 'running' }
    }
    const onNodeContentChange = vi.fn().mockResolvedValue(undefined)
    const onTextNodeGenerate = vi.fn()
    const onGenerateNodeRun = vi.fn()
    const onNodeDelete = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[textNode, emptyTextNode, imageNode, resultNode, failedGenerateNode, runningGenerateNode]}
          onViewportCommit={vi.fn()}
          onNodeContentChange={onNodeContentChange}
          onTextNodeGenerate={onTextNodeGenerate}
          onGenerateNodeRun={onGenerateNodeRun}
          onNodeDelete={onNodeDelete}
          onNodeMetadataChange={vi.fn()}
        />
      )
    })

    const textToolbar = toolbarForNode(textNode.id)
    expect(textToolbar?.className).toContain('opacity-0')
    await act(async () => {
      nodeElement(textNode.id)?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    expect(toolbarForNode(textNode.id)?.className).toContain('opacity-100')

    await act(async () => {
      toolbarButton(textNode.id, '从文本生成')?.click()
      await Promise.resolve()
    })
    expect(onNodeContentChange).toHaveBeenCalledWith(textNode.id, textNode.metadata.content)
    expect(onTextNodeGenerate).toHaveBeenCalledWith(textNode.id)

    expect(toolbarButton(emptyTextNode.id, '从文本生成')?.disabled).toBe(true)
    await act(async () => {
      toolbarButton(emptyTextNode.id, '从文本生成')?.click()
      await Promise.resolve()
    })
    expect(onTextNodeGenerate).toHaveBeenCalledTimes(1)

    await act(async () => {
      toolbarButton(imageNode.id, '预览图片')?.click()
      await Promise.resolve()
    })
    expect(document.querySelector<HTMLElement>('[aria-label="Canvas 图片预览"]')?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA==')
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="关闭图片预览"]')?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    })

    await act(async () => {
      toolbarButton(imageNode.id, '添加 mask')?.click()
      await Promise.resolve()
    })
    expect(document.querySelector<HTMLElement>('[aria-label="Canvas mask 编辑器"]')).toBeTruthy()
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="Canvas mask 编辑器"] button[title="关闭"]')?.click()
    })

    await act(async () => {
      toolbarButton(resultNode.id, '预览图片')?.click()
      await Promise.resolve()
    })
    expect(document.querySelector<HTMLElement>('[aria-label="Canvas 图片预览"]')?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,cmVzdWx0')
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="关闭图片预览"]')?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    })

    await act(async () => {
      toolbarButton(failedGenerateNode.id, '重试生成')?.click()
    })
    expect(onGenerateNodeRun).toHaveBeenCalledWith(failedGenerateNode.id)
    expect(toolbarButton(runningGenerateNode.id, '运行生成')?.disabled).toBe(true)

    await act(async () => {
      toolbarButton(imageNode.id, '删除节点')?.click()
    })
    expect(onNodeDelete).toHaveBeenCalledWith(imageNode.id)

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('opens a create menu from a connection to empty canvas space', async () => {
    const textNode: CanvasNodeData = {
      id: 'node-create-menu-text',
      type: 'text',
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'create menu prompt' }
    }
    const onViewportCommit = vi.fn()
    const onConnectionCreate = vi.fn().mockResolvedValue({
      id: 'node-created-generate',
      type: 'generate',
      title: '生成节点',
      position: { x: 210, y: 100 },
      width: 300,
      height: 260,
      metadata: { content: '', status: 'idle' }
    })
    const captureSpy = installPointerCaptureSpies()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 40, y: -20, k: 2 }}
          nodes={[textNode]}
          onViewportCommit={onViewportCommit}
          onConnectionCreate={onConnectionCreate}
        />
      )
    })

    await act(async () => {
      findButtonByTitle('从提示词端口连线')?.click()
    })
    await act(async () => {
      dispatchPointer(canvasSurface()!, 'pointerdown', { clientX: 460, clientY: 180 })
    })

    const menu = document.querySelector<HTMLElement>('[data-canvas-connection-create-menu="true"]')
    expect(menu).toBeTruthy()
    expect(menu?.style.left).toBe('210px')
    expect(menu?.style.top).toBe('100px')
    expect(menu?.textContent).toContain('生成节点')
    expect(menu?.textContent).not.toContain('结果节点')
    expect(document.body.textContent).not.toContain('视频')
    expect(document.body.textContent).not.toContain('音频')
    expect(captureSpy.setPointerCapture).not.toHaveBeenCalled()
    expect(onViewportCommit).not.toHaveBeenCalled()

    await act(async () => {
      findButtonByTitle('创建生成节点')?.click()
      await Promise.resolve()
    })

    expect(onConnectionCreate).toHaveBeenCalledWith({
      sourceNodeId: textNode.id,
      type: 'generate',
      position: { x: 210, y: 100 }
    })
    expect(document.querySelector<HTMLElement>('[data-canvas-connection-create-menu="true"]')).toBeNull()
    expect(onViewportCommit).not.toHaveBeenCalled()

    captureSpy.restore()
    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('offers result nodes when creating from a generate connection', async () => {
    const generateNode: CanvasNodeData = {
      id: 'node-create-menu-generate',
      type: 'generate',
      title: '生成节点',
      position: { x: 20, y: 24 },
      width: 300,
      height: 260,
      metadata: { content: 'prompt', status: 'idle' }
    }
    const onConnectionCreate = vi.fn().mockResolvedValue({
      id: 'node-created-result',
      type: 'result',
      title: '结果节点',
      position: { x: 320, y: 160 },
      width: 320,
      height: 260,
      metadata: { content: '', status: 'idle' }
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[generateNode]}
          onViewportCommit={vi.fn()}
          onConnectionCreate={onConnectionCreate}
        />
      )
    })

    await act(async () => {
      findButtonByTitle('从结果端口连线')?.click()
    })
    await act(async () => {
      dispatchPointer(canvasSurface()!, 'pointerdown', { clientX: 320, clientY: 160 })
    })

    const menu = document.querySelector<HTMLElement>('[data-canvas-connection-create-menu="true"]')
    expect(menu?.textContent).toContain('结果节点')
    expect(menu?.textContent).not.toContain('生成节点')

    await act(async () => {
      findButtonByTitle('创建结果节点')?.click()
      await Promise.resolve()
    })
    expect(onConnectionCreate).toHaveBeenCalledWith({
      sourceNodeId: generateNode.id,
      type: 'result',
      position: { x: 320, y: 160 }
    })

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('renders old persisted result image nodes with readable display size and title', async () => {
    const resultNode: CanvasNodeData = {
      id: 'node-old-result',
      type: 'result',
      title: 'history_416b7ff0637872ca11f7c1c2a66054ddb10c2ddbdbb9019ab1b316333e5b5c0a',
      position: { x: 20, y: 24 },
      width: 260,
      height: 180,
      metadata: {
        content: 'data:image/png;base64,cmVzdWx0',
        status: 'succeeded',
        historyItemId: 'history_416b7ff0637872ca11f7c1c2a66054ddb10c2ddbdbb9019ab1b316333e5b5c0a',
        mimeType: 'image/png',
        fileSizeBytes: 6
      }
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[resultNode]}
          onViewportCommit={vi.fn()}
        />
      )
    })

    const resultElement = document.querySelector<HTMLElement>('[data-canvas-node-id="node-old-result"]')
    const resultTitle = resultElement?.querySelector<HTMLElement>('span.truncate')
    expect(resultElement?.style.width).toBe('320px')
    expect(resultElement?.style.height).toBe('260px')
    expect(resultTitle?.className).toContain('truncate')
    expect(resultTitle?.title).toBe(resultNode.title)
    expect(resultTitle?.textContent).toContain('...')
    expect(resultTitle?.textContent).not.toBe(resultNode.title)
    expect(document.querySelector<HTMLImageElement>('[data-canvas-node-id="node-old-result"] img')?.alt).toBe(resultNode.title)

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('sizes old persisted image nodes by natural image aspect ratio', async () => {
    const wideImageNode: CanvasNodeData = {
      id: 'node-wide-image',
      type: 'image',
      title: 'history_wide-image',
      position: { x: 20, y: 24 },
      width: 240,
      height: 180,
      metadata: {
        content: 'data:image/png;base64,AA==',
        mimeType: 'image/png',
        fileSizeBytes: 2,
        naturalWidth: 1600,
        naturalHeight: 400
      }
    }
    const tallImageNode: CanvasNodeData = {
      id: 'node-tall-image',
      type: 'image',
      title: 'history_tall-image',
      position: { x: 500, y: 24 },
      width: 240,
      height: 180,
      metadata: {
        content: 'data:image/png;base64,AA==',
        mimeType: 'image/png',
        fileSizeBytes: 2,
        naturalWidth: 512,
        naturalHeight: 1024
      }
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[wideImageNode, tallImageNode]}
          onViewportCommit={vi.fn()}
        />
      )
    })

    expect(document.querySelector<HTMLElement>('[data-canvas-node-id="node-wide-image"]')?.style.width).toBe('440px')
    expect(document.querySelector<HTMLElement>('[data-canvas-node-id="node-wide-image"]')?.style.height).toBe('260px')
    expect(document.querySelector<HTMLElement>('[data-canvas-node-id="node-tall-image"]')?.style.width).toBe('320px')
    expect(document.querySelector<HTMLElement>('[data-canvas-node-id="node-tall-image"]')?.style.height).toBe('360px')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('keeps uncommitted text drafts when canvas nodes rerender', async () => {
    const textNode: CanvasNodeData = {
      id: 'node-draft-text',
      type: 'text',
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'saved prompt' }
    }
    const onNodeContentChange = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[textNode]}
          onViewportCommit={vi.fn()}
          onNodeContentChange={onNodeContentChange}
        />
      )
    })

    const textarea = document.querySelector<HTMLTextAreaElement>('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, 'unsaved draft')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1.12 }}
          nodes={[{ ...textNode, metadata: { content: 'saved prompt' } }]}
          onViewportCommit={vi.fn()}
          onNodeContentChange={onNodeContentChange}
        />
      )
    })

    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('unsaved draft')

    await act(async () => {
      document.querySelector<HTMLTextAreaElement>('textarea')?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(onNodeContentChange).toHaveBeenCalledWith(textNode.id, 'unsaved draft')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('keeps expanded text dialog controls outside canvas drag capture', async () => {
    const textNode: CanvasNodeData = {
      id: 'node-expanded-text-close',
      type: 'text',
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'dialog prompt' }
    }
    const onViewportCommit = vi.fn()
    const captureSpy = installPointerCaptureSpies()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[textNode]}
          onViewportCommit={onViewportCommit}
        />
      )
    })

    await act(async () => {
      findButtonByTitle('放大编辑')?.click()
    })
    const dialog = document.querySelector<HTMLElement>('[aria-label="Canvas 文本节点编辑器"]')
    expect(dialog).toBeTruthy()

    const closeButton = dialog?.querySelector<HTMLButtonElement>('button[title="关闭"]')
    expect(closeButton).toBeTruthy()
    await act(async () => {
      dispatchPointer(closeButton!, 'pointerdown')
      dispatchPointer(closeButton!, 'pointerup')
      closeButton!.click()
    })

    expect(captureSpy.setPointerCapture).not.toHaveBeenCalled()
    expect(onViewportCommit).not.toHaveBeenCalled()
    expect(document.querySelector<HTMLElement>('[aria-label="Canvas 文本节点编辑器"]')).toBeNull()

    captureSpy.restore()
    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('renders generate node preview and run action', async () => {
    const generateNode: CanvasNodeData = {
      id: 'node-generate',
      type: 'generate',
      title: '生成节点',
      position: { x: 20, y: 24 },
      width: 300,
      height: 260,
      metadata: {
        content: 'studio lighting',
        status: 'idle',
        runId: 'run-generate-preview',
        requestIndex: 0
      }
    }
    const onGenerateNodeRun = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[generateNode]}
          generationPreviews={{
            'run-generate-preview': {
              0: {
                runId: 'run-generate-preview',
                requestIndex: 0,
                partialImageIndex: 0,
                dataUrl: 'data:image/png;base64,cHJldmlldw==',
                receivedAt: '2026-06-05T10:00:00.000Z'
              }
            }
          }}
          onViewportCommit={vi.fn()}
          onGenerateNodeRun={onGenerateNodeRun}
        />
      )
    })

    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('studio lighting')
    expect(document.querySelector<HTMLImageElement>('img[alt="Canvas 生成中的流式预览"]')?.src).toBe('data:image/png;base64,cHJldmlldw==')

    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('运行'))?.click()
    })
    expect(onGenerateNodeRun).toHaveBeenCalledWith(generateNode.id)

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('renders generation input summary from connected canvas nodes', async () => {
    const textNode: CanvasNodeData = {
      id: 'node-summary-text',
      type: 'text',
      title: '文本节点',
      position: { x: 20, y: 24 },
      width: 220,
      height: 140,
      metadata: { content: 'upstream prompt' }
    }
    const imageNode: CanvasNodeData = {
      id: 'node-summary-image',
      type: 'image',
      title: '图片节点',
      position: { x: 20, y: 224 },
      width: 240,
      height: 180,
      metadata: { content: 'data:image/png;base64,AA==', mimeType: 'image/png', fileSizeBytes: 2 }
    }
    const resultNode: CanvasNodeData = {
      id: 'node-summary-result',
      type: 'result',
      title: '结果节点',
      position: { x: 20, y: 444 },
      width: 260,
      height: 220,
      metadata: { content: '', status: 'succeeded', referenceImageId: 'reference-summary-result' }
    }
    const configNode: CanvasNodeData = {
      id: 'node-summary-config',
      type: 'config',
      title: '配置节点',
      position: { x: 320, y: 24 },
      width: 260,
      height: 180,
      metadata: { content: '', ratio: '16:9', quality: 'high', n: 2 }
    }
    const batchNode: CanvasNodeData = {
      id: 'node-summary-batch',
      type: 'batch',
      title: '批量节点',
      position: { x: 320, y: 244 },
      width: 260,
      height: 220,
      metadata: { content: 'variant one\n\nvariant two' }
    }
    const generateNode: CanvasNodeData = {
      id: 'node-summary-generate',
      type: 'generate',
      title: '生成节点',
      position: { x: 640, y: 24 },
      width: 300,
      height: 280,
      metadata: { content: 'local prompt', status: 'idle' }
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[textNode, imageNode, resultNode, configNode, batchNode, generateNode]}
          connections={[
            { id: 'summary-prompt', fromNodeId: textNode.id, toNodeId: generateNode.id, kind: 'prompt' },
            { id: 'summary-image', fromNodeId: imageNode.id, toNodeId: generateNode.id, kind: 'reference-image' },
            { id: 'summary-result', fromNodeId: resultNode.id, toNodeId: generateNode.id, kind: 'reference-image' },
            { id: 'summary-config', fromNodeId: configNode.id, toNodeId: generateNode.id, kind: 'config' },
            { id: 'summary-batch', fromNodeId: batchNode.id, toNodeId: generateNode.id, kind: 'batch' }
          ]}
          onViewportCommit={vi.fn()}
        />
      )
    })

    const generateElement = nodeElement(generateNode.id)
    expect(generateElement?.textContent).toContain('提示词 1+本节点')
    expect(generateElement?.textContent).toContain('参考图 2')
    expect(generateElement?.textContent).toContain('参数 1')
    expect(generateElement?.textContent).toContain('批量 2')
    expect(generateElement?.textContent).toContain('工作流请求 2')
    expect(generateElement?.textContent).not.toContain('缺少有效提示词')
    expect(document.body.textContent).not.toContain('视频')
    expect(document.body.textContent).not.toContain('音频')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('warns when a generate node has no effective prompt', async () => {
    const generateNode: CanvasNodeData = {
      id: 'node-summary-missing-prompt',
      type: 'generate',
      title: '生成节点',
      position: { x: 20, y: 24 },
      width: 300,
      height: 280,
      metadata: { content: '   ', status: 'idle' }
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[generateNode]}
          onViewportCommit={vi.fn()}
        />
      )
    })

    const generateElement = nodeElement(generateNode.id)
    expect(generateElement?.textContent).toContain('缺提示词')
    expect(generateElement?.textContent).toContain('缺少有效提示词，运行前请连接文本节点或填写本节点提示词。')
    expect(generateElement?.textContent).toContain('工作流请求 1')
    expect(generateElement?.textContent).not.toContain('待运行')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('opens the canvas mask editor from image nodes', async () => {
    const imageNode: CanvasNodeData = {
      id: 'node-mask-image',
      type: 'image',
      title: '图片节点',
      position: { x: 20, y: 24 },
      width: 240,
      height: 180,
      metadata: { content: 'data:image/png;base64,AA==', mimeType: 'image/png', fileSizeBytes: 2 }
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[imageNode]}
          onViewportCommit={vi.fn()}
          onNodeMetadataChange={vi.fn()}
        />
      )
    })

    await act(async () => {
      findButtonByTitle('添加 mask')?.click()
    })

    expect(document.querySelector<HTMLElement>('[aria-label="Canvas mask 编辑器"]')).toBeTruthy()
    expect(document.body.textContent).toContain('画笔')
    expect(document.body.textContent).toContain('保存')
    expect(findButtonByTitle('添加 mask')?.className).not.toContain('opacity-0')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('keeps mask editor toolbar actions outside canvas drag capture', async () => {
    const imageNode: CanvasNodeData = {
      id: 'node-mask-toolbar-image',
      type: 'image',
      title: '图片节点',
      position: { x: 20, y: 24 },
      width: 240,
      height: 180,
      metadata: { content: 'data:image/png;base64,AA==', mimeType: 'image/png', fileSizeBytes: 2 }
    }
    const onNodeMetadataChange = vi.fn()
    const onViewportCommit = vi.fn()
    const captureSpy = installPointerCaptureSpies()
    const canvasContextSpy = installEmptyCanvasContext()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[imageNode]}
          onViewportCommit={onViewportCommit}
          onNodeMetadataChange={onNodeMetadataChange}
        />
      )
    })

    await act(async () => {
      findButtonByTitle('添加 mask')?.click()
    })
    const editor = document.querySelector<HTMLElement>('[aria-label="Canvas mask 编辑器"]')
    expect(editor).toBeTruthy()

    const eraserButton = findButtonByTitle('橡皮')
    await act(async () => {
      dispatchPointer(eraserButton!, 'pointerdown')
      dispatchPointer(eraserButton!, 'pointerup')
      eraserButton?.click()
    })
    expect(eraserButton?.getAttribute('data-variant')).toBe('secondary')

    const saveButton = findButtonByTitle('保存 mask')
    await act(async () => {
      dispatchPointer(saveButton!, 'pointerdown')
      dispatchPointer(saveButton!, 'pointerup')
      saveButton?.click()
    })
    expect(captureSpy.setPointerCapture).not.toHaveBeenCalled()
    expect(onViewportCommit).not.toHaveBeenCalled()
    expect(onNodeMetadataChange).toHaveBeenCalledWith(imageNode.id, { maskDataUrl: '', maskUpdatedAt: '' })
    expect(document.querySelector<HTMLElement>('[aria-label="Canvas mask 编辑器"]')).toBeNull()

    captureSpy.restore()
    canvasContextSpy.mockRestore()
    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('renders advanced workflow node bodies and commits batch edits', async () => {
    const configNode: CanvasNodeData = {
      id: 'node-config',
      type: 'config',
      title: '配置节点',
      position: { x: 20, y: 24 },
      width: 260,
      height: 180,
      metadata: { content: '', ratio: '16:9', quality: 'high', n: 2 }
    }
    const batchNode: CanvasNodeData = {
      id: 'node-batch',
      type: 'batch',
      title: '批量节点',
      position: { x: 320, y: 24 },
      width: 260,
      height: 220,
      metadata: { content: 'first\nsecond' }
    }
    const resultNode: CanvasNodeData = {
      id: 'node-result',
      type: 'result',
      title: '结果节点',
      position: { x: 620, y: 24 },
      width: 260,
      height: 220,
      metadata: {
        content: 'data:image/png;base64,cmVzdWx0',
        status: 'succeeded',
        historyItemId: 'history-result',
        requestIndex: 1,
        batchIndex: 0,
        promptVariant: 'variant result',
        mimeType: 'image/png',
        fileSizeBytes: 6
      }
    }
    const onNodeContentChange = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <CanvasViewport
          viewport={{ x: 0, y: 0, k: 1 }}
          nodes={[configNode, batchNode, resultNode]}
          onViewportCommit={vi.fn()}
          onNodeContentChange={onNodeContentChange}
        />
      )
    })

    expect(document.body.textContent).toContain('比例')
    expect(document.body.textContent).toContain('Prompt 变体')
    expect(document.body.textContent).toContain('PNG · #2 · 批量 1 · History')
    expect(document.querySelector<HTMLImageElement>('img[alt="结果节点"]')?.src).toBe('data:image/png;base64,cmVzdWx0')

    const batchTextarea = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea')).find((item) => item.value.includes('first'))
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(batchTextarea, 'third')
      batchTextarea!.dispatchEvent(new Event('input', { bubbles: true }))
      batchTextarea!.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(onNodeContentChange).toHaveBeenCalledWith(batchNode.id, 'third')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })
})

function findButtonByTitle(title: string): HTMLButtonElement | undefined {
  return findButtonsByTitle(title)[0]
}

function findButtonsByTitle(title: string): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.title === title)
}

function nodeElement(nodeId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-canvas-node-id="${nodeId}"]`)
}

function toolbarForNode(nodeId: string): HTMLElement | null {
  return nodeElement(nodeId)?.querySelector<HTMLElement>('[data-canvas-node-action-toolbar="true"]') || null
}

function toolbarButton(nodeId: string, title: string): HTMLButtonElement | undefined {
  return Array.from(toolbarForNode(nodeId)?.querySelectorAll<HTMLButtonElement>('button') || []).find((button) => button.title === title)
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

function installPointerCaptureSpies(): {
  setPointerCapture: ReturnType<typeof vi.fn>
  releasePointerCapture: ReturnType<typeof vi.fn>
  restore: () => void
} {
  const setPointerCapture = vi.fn()
  const releasePointerCapture = vi.fn()
  const previousSetPointerCapture = HTMLElement.prototype.setPointerCapture
  const previousReleasePointerCapture = HTMLElement.prototype.releasePointerCapture
  HTMLElement.prototype.setPointerCapture = setPointerCapture
  HTMLElement.prototype.releasePointerCapture = releasePointerCapture
  return {
    setPointerCapture,
    releasePointerCapture,
    restore: () => {
      if (previousSetPointerCapture) {
        HTMLElement.prototype.setPointerCapture = previousSetPointerCapture
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture
      }
      if (previousReleasePointerCapture) {
        HTMLElement.prototype.releasePointerCapture = previousReleasePointerCapture
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture
      }
    }
  }
}

function installEmptyCanvasContext() {
  return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    getImageData: () => ({ data: new Uint8ClampedArray(4) })
  }) as unknown as CanvasRenderingContext2D)
}
