import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import type { Conversation } from '../../shared/types'
import { Composer } from './Composer'

function conversation(): Conversation {
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
    updatedAt: '2026-05-23T12:00:00.000Z'
  }
}

describe('Composer', () => {
  async function renderComposer() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<Composer conversation={conversation()} generating={false} />)
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
})
