import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import type { Conversation } from '../../shared/types'
import { Composer } from './Composer'

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-prompt-expand-test',
    title: 'Logo prompt',
    draftPrompt: 'A long PixAI logo prompt with product details, reference images, prompt enrichment, gallery management, and local Codex bridge.',
    model: 'gpt-image-2',
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
    createdAt: '2026-05-23T12:00:00.000Z',
    updatedAt: '2026-05-23T12:00:00.000Z',
    ...overrides
  }
}

describe('Composer', () => {
  async function renderComposer(input = conversation()) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<Composer conversation={input} generating={false} />)
    })
    return { host, root }
  }

  it('opens an expanded prompt editor from the composer', async () => {
    const { host, root } = await renderComposer()

    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[title="放大查看提示词"]')?.click()
    })

    expect(document.querySelector('[aria-label="提示词放大编辑"]')).not.toBeNull()
    expect(document.querySelector<HTMLTextAreaElement>('.prompt-expand-textarea')?.value).toContain('PixAI logo prompt')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('opens a large preview from a reference image thumbnail', async () => {
    const { host, root } = await renderComposer(
      conversation({
        referenceImages: [
          {
            id: 'reference-preview-test',
            name: 'reference.png',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,cmVmZXJlbmNl',
            fileSizeBytes: 9,
            createdAt: '2026-05-23T12:01:00.000Z'
          }
        ]
      })
    )

    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[title="查看参考图"]')?.click()
    })

    expect(document.querySelector('[aria-label="参考图预览"]')).not.toBeNull()
    expect(document.querySelector<HTMLImageElement>('.image-preview-stage img')?.src).toContain('data:image/png;base64,cmVmZXJlbmNl')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('keeps reference removal separate from the preview trigger', async () => {
    const { host, root } = await renderComposer(
      conversation({
        referenceImages: [
          {
            id: 'reference-remove-test',
            name: 'remove.png',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,cmVtb3Zl',
            fileSizeBytes: 6,
            createdAt: '2026-05-23T12:02:00.000Z'
          }
        ]
      })
    )

    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[title="移除参考图"]')?.click()
    })

    expect(document.querySelector('[aria-label="参考图预览"]')).toBeNull()

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })
})
