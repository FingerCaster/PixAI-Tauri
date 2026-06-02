import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageHistoryItem } from '../../shared/types'
import { useAppStore } from '../../store/app-store'
import { GalleryPage } from './GalleryPage'

function historyItem(id: string): ImageHistoryItem {
  return {
    id,
    conversationId: 'gallery-confirm-conversation',
    runId: 'gallery-confirm-run',
    prompt: `测试图片 ${id}`,
    model: 'gpt-image-2',
    ratio: '1:1',
    size: '1024x1024',
    quality: 'high',
    requestIndex: 0,
    durationMs: 1200,
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    fileSizeBytes: 5,
    status: 'succeeded',
    errorMessage: null,
    errorDetails: null,
    retryAttempt: 0,
    favorite: false,
    generationMode: 'text-to-image',
    referenceImages: [],
    createdAt: '2026-06-02T10:00:00.000Z'
  }
}

describe('GalleryPage destructive actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useAppStore.setState({
      favoritesOnly: false,
      history: [historyItem('history-gallery-1'), historyItem('history-gallery-2')],
      query: '',
      reloadHistory: vi.fn().mockResolvedValue(undefined),
      setFavoritesOnly: vi.fn().mockResolvedValue(undefined),
      setQuery: vi.fn(),
      deleteHistory: vi.fn().mockResolvedValue(undefined),
      reuseHistory: vi.fn().mockResolvedValue(undefined),
      toggleFavorite: vi.fn().mockResolvedValue(undefined),
      notify: vi.fn()
    })
  })

  async function renderGallery() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<GalleryPage />)
    })
    return { host, root }
  }

  it('asks before deleting one gallery image', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const deleteHistory = useAppStore.getState().deleteHistory
    const { host, root } = await renderGallery()
    const galleryDeleteButton = document.querySelectorAll<HTMLButtonElement>('.gallery-actions button')[1]

    await act(async () => {
      galleryDeleteButton?.click()
    })

    expect(confirm).toHaveBeenCalledWith('确认删除这张图片记录？')
    expect(deleteHistory).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await act(async () => {
      galleryDeleteButton?.click()
    })

    expect(deleteHistory).toHaveBeenCalledWith('history-gallery-1')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('asks once before deleting selected gallery images', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const deleteHistory = useAppStore.getState().deleteHistory
    const { host, root } = await renderGallery()
    const selectAllButton = findButtonByText('全选')
    const deleteSelectedButton = findButtonByText('删除选中')

    await act(async () => {
      selectAllButton?.click()
    })
    await act(async () => {
      deleteSelectedButton?.click()
    })

    expect(confirm).toHaveBeenCalledWith('确认删除选中的 2 张图片记录？')
    expect(deleteHistory).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await act(async () => {
      deleteSelectedButton?.click()
    })

    expect(confirm).toHaveBeenCalledTimes(2)
    expect(deleteHistory).toHaveBeenCalledTimes(2)
    expect(deleteHistory).toHaveBeenNthCalledWith(1, 'history-gallery-1')
    expect(deleteHistory).toHaveBeenNthCalledWith(2, 'history-gallery-2')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })
})

function findButtonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes(text))
}
