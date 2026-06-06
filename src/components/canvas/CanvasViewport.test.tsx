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
      position: { x: 20, y: 224 },
      width: 240,
      height: 180,
      metadata: { content: 'data:image/png;base64,AA==', mimeType: 'image/png', fileSizeBytes: 2 }
    }
    const connections: CanvasConnection[] = [
      { id: 'connection-one', fromNodeId: textNode.id, toNodeId: imageNode.id, kind: 'prompt' }
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
          nodes={[textNode, imageNode]}
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
    expect(document.querySelector('path.cursor-pointer')?.getAttribute('d')).toBe('M 202 42 C -44 42, -44 242, 28 242')
    expect(document.querySelector('svg')?.classList.contains('text-primary')).toBe(true)

    await act(async () => {
      document.querySelector('textarea')?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120 }))
    })
    expect(onViewportCommit).not.toHaveBeenCalled()

    await act(async () => {
      findButtonByTitle('开始连线')?.click()
    })
    await act(async () => {
      findButtonsByTitle('完成连线')[1]?.click()
    })
    expect(onConnectionAdd).toHaveBeenCalledWith(textNode.id, imageNode.id)

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

    expect(findButtonsByTitle('开始连线')).toHaveLength(2)
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
