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
    expect(document.querySelector('img')?.className).toContain('object-contain')
    expect(document.querySelectorAll('path.cursor-pointer')).toHaveLength(1)
    expect(document.querySelector('path.cursor-pointer')?.getAttribute('stroke')).toBe('currentColor')
    expect(document.querySelector('path.cursor-pointer')?.getAttribute('d')).toBe('M 218 42 C 326 42, 326 242, 238 242')
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
    expect(document.querySelector<HTMLElement>('[aria-label="Canvas 图片预览"] img')?.getAttribute('src')).toBe('data:image/png;base64,AA==')

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
