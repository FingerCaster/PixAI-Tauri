import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import type { ImageHistoryItem } from '../../shared/types'
import { ImageTile } from './ImageTile'

function succeededItem(): ImageHistoryItem {
  return {
    id: 'history-preview-test',
    conversationId: 'conversation-preview-test',
    runId: 'run-preview-test',
    prompt: '一位身穿银白色未来感长袍的年轻女性',
    model: 'gpt-image-2',
    ratio: '1:1',
    size: '1024x1024',
    quality: 'high',
    requestIndex: 0,
    durationMs: 214000,
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    fileSizeBytes: 5,
    status: 'succeeded',
    errorMessage: null,
    errorDetails: null,
    retryAttempt: 0,
    favorite: false,
    generationMode: 'text-to-image',
    referenceImages: [],
    createdAt: '2026-05-22T14:14:51.341Z'
  }
}

describe('ImageTile', () => {
  async function renderTile() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<ImageTile item={succeededItem()} />)
    })
    return { host, root }
  }

  it('opens a large image preview from the generated image', async () => {
    const { host, root } = await renderTile()

    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[title="查看大图"]')?.click()
    })

    expect(document.querySelector('[aria-label="图片预览"]')).not.toBeNull()
    expect(document.querySelector<HTMLImageElement>('.image-preview-stage img')?.src).toContain('data:image/png;base64,aGVsbG8=')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('closes the large image preview without reopening it', async () => {
    const { host, root } = await renderTile()

    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[title="查看大图"]')?.click()
    })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.image-preview-panel button[title="关闭"]')?.click()
    })

    expect(document.querySelector('[aria-label="图片预览"]')).toBeNull()

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })
})
