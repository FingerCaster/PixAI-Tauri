import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageHistoryItem } from '../../shared/types'
import * as platformModule from '../../lib/platform'
import { pixaiApi } from '../../services/app-api'
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
      toggleFavorite: vi.fn().mockResolvedValue(undefined),
      updatePreferences: vi.fn().mockResolvedValue(undefined),
      preferences: {
        notifyOnImageSuccess: false,
        closeToTray: true,
        downloadOpenFolderBehavior: 'ask',
        notificationPermission: 'unsupported'
      },
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

  it('downloads multiple selected gallery images in one batch', async () => {
    const downloadHistoryImages = vi.spyOn(platformModule, 'downloadHistoryImages').mockResolvedValue({
      savedCount: 2,
      canceled: false,
      directory: 'E:\\BatchExports',
      paths: ['E:\\BatchExports\\history-gallery-1.png', 'E:\\BatchExports\\history-gallery-2.png']
    })
    const notify = vi.fn()
    const revealPaths = vi.spyOn(pixaiApi.shell, 'revealPaths').mockResolvedValue(undefined)
    useAppStore.setState({ notify })
    const { host, root } = await renderGallery()
    const selectAllButton = findButtonByText('全选')
    const downloadButton = findButtonByText('下载')

    await act(async () => {
      selectAllButton?.click()
    })
    await act(async () => {
      downloadButton?.click()
    })

    expect(downloadHistoryImages).toHaveBeenCalledTimes(1)
    expect(downloadHistoryImages).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'history-gallery-1' }),
      expect.objectContaining({ id: 'history-gallery-2' })
    ])
    expect(notify).toHaveBeenCalledWith('已保存 2 张图片到所选文件夹')
    expect(document.querySelector('[aria-label="下载完成"]')).not.toBeNull()
    expect(revealPaths).not.toHaveBeenCalled()

    await act(async () => {
      findButtonByText('打开位置')?.click()
      await flushPromises()
    })

    expect(revealPaths).toHaveBeenCalledWith([
      'E:\\BatchExports\\history-gallery-1.png',
      'E:\\BatchExports\\history-gallery-2.png'
    ])

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('remembers the open-folder choice from the download completion dialog', async () => {
    vi.spyOn(platformModule, 'downloadHistoryImages').mockResolvedValue({
      savedCount: 2,
      canceled: false,
      directory: 'E:\\BatchExports',
      paths: ['E:\\BatchExports\\history-gallery-1.png', 'E:\\BatchExports\\history-gallery-2.png']
    })
    const updatePreferences = vi.fn().mockResolvedValue(undefined)
    const revealPaths = vi.spyOn(pixaiApi.shell, 'revealPaths').mockResolvedValue(undefined)
    useAppStore.setState({ updatePreferences })
    const { host, root } = await renderGallery()

    await act(async () => {
      findButtonByText('全选')?.click()
    })
    await act(async () => {
      findButtonByText('下载')?.click()
      await flushPromises()
    })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="不再打扰"]')?.click()
    })
    await act(async () => {
      findButtonByText('不用打开')?.click()
      await flushPromises()
    })

    expect(updatePreferences).toHaveBeenCalledWith({ downloadOpenFolderBehavior: 'never' })
    expect(revealPaths).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('still opens the downloaded folder when remembering the open choice fails', async () => {
    vi.spyOn(platformModule, 'downloadHistoryImages').mockResolvedValue({
      savedCount: 2,
      canceled: false,
      directory: 'E:\\BatchExports',
      paths: ['E:\\BatchExports\\history-gallery-1.png', 'E:\\BatchExports\\history-gallery-2.png']
    })
    const updatePreferences = vi.fn().mockRejectedValue(new Error('disk full'))
    const notify = vi.fn()
    const revealPaths = vi.spyOn(pixaiApi.shell, 'revealPaths').mockResolvedValue(undefined)
    useAppStore.setState({ notify, updatePreferences })
    const { host, root } = await renderGallery()

    await act(async () => {
      findButtonByText('全选')?.click()
    })
    await act(async () => {
      findButtonByText('下载')?.click()
      await flushPromises()
    })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="不再打扰"]')?.click()
    })
    await act(async () => {
      findButtonByText('打开位置')?.click()
      await flushPromises()
    })

    expect(updatePreferences).toHaveBeenCalledWith({ downloadOpenFolderBehavior: 'always' })
    expect(revealPaths).toHaveBeenCalledWith([
      'E:\\BatchExports\\history-gallery-1.png',
      'E:\\BatchExports\\history-gallery-2.png'
    ])
    expect(notify).toHaveBeenCalledWith('打开文件夹偏好保存失败：disk full')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('opens the downloaded folder immediately when the preference is always', async () => {
    vi.spyOn(platformModule, 'downloadHistoryImages').mockResolvedValue({
      savedCount: 2,
      canceled: false,
      directory: 'E:\\BatchExports',
      paths: ['E:\\BatchExports\\history-gallery-1.png', 'E:\\BatchExports\\history-gallery-2.png']
    })
    const notify = vi.fn()
    const revealPaths = vi.spyOn(pixaiApi.shell, 'revealPaths').mockResolvedValue(undefined)
    useAppStore.setState({
      notify,
      preferences: {
        notifyOnImageSuccess: false,
        closeToTray: true,
        downloadOpenFolderBehavior: 'always',
        notificationPermission: 'unsupported'
      }
    })
    const { host, root } = await renderGallery()

    await act(async () => {
      findButtonByText('全选')?.click()
    })
    await act(async () => {
      findButtonByText('下载')?.click()
      await flushPromises()
    })

    expect(revealPaths).toHaveBeenCalledWith([
      'E:\\BatchExports\\history-gallery-1.png',
      'E:\\BatchExports\\history-gallery-2.png'
    ])
    expect(document.querySelector('[aria-label="下载完成"]')).toBeNull()
    expect(notify).toHaveBeenCalledWith('已保存 2 张图片到所选文件夹')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('skips the folder prompt when the preference is never', async () => {
    vi.spyOn(platformModule, 'downloadHistoryImages').mockResolvedValue({
      savedCount: 2,
      canceled: false,
      directory: 'E:\\BatchExports',
      paths: ['E:\\BatchExports\\history-gallery-1.png', 'E:\\BatchExports\\history-gallery-2.png']
    })
    const revealPaths = vi.spyOn(pixaiApi.shell, 'revealPaths').mockResolvedValue(undefined)
    useAppStore.setState({
      preferences: {
        notifyOnImageSuccess: false,
        closeToTray: true,
        downloadOpenFolderBehavior: 'never',
        notificationPermission: 'unsupported'
      }
    })
    const { host, root } = await renderGallery()

    await act(async () => {
      findButtonByText('全选')?.click()
    })
    await act(async () => {
      findButtonByText('下载')?.click()
      await flushPromises()
    })

    expect(revealPaths).not.toHaveBeenCalled()
    expect(document.querySelector('[aria-label="下载完成"]')).toBeNull()

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('does not prompt when a download result has no folder directory', async () => {
    vi.spyOn(platformModule, 'downloadHistoryImages').mockResolvedValue({
      savedCount: 1,
      canceled: false
    })
    const revealPaths = vi.spyOn(pixaiApi.shell, 'revealPaths').mockResolvedValue(undefined)
    const { host, root } = await renderGallery()

    await act(async () => {
      document.querySelectorAll<HTMLButtonElement>('button[aria-label="选择图片"]')[0]?.click()
    })
    await act(async () => {
      findButtonByText('下载')?.click()
      await flushPromises()
    })

    expect(revealPaths).not.toHaveBeenCalled()
    expect(document.querySelector('[aria-label="下载完成"]')).toBeNull()

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('keeps a successful download notification when opening the folder fails', async () => {
    vi.spyOn(platformModule, 'downloadHistoryImages').mockResolvedValue({
      savedCount: 2,
      canceled: false,
      directory: 'E:\\BatchExports',
      paths: ['E:\\BatchExports\\history-gallery-1.png', 'E:\\BatchExports\\history-gallery-2.png']
    })
    const notify = vi.fn()
    vi.spyOn(pixaiApi.shell, 'revealPaths').mockRejectedValue(new Error('denied'))
    useAppStore.setState({
      notify,
      preferences: {
        notifyOnImageSuccess: false,
        closeToTray: true,
        downloadOpenFolderBehavior: 'always',
        notificationPermission: 'unsupported'
      }
    })
    const { host, root } = await renderGallery()

    await act(async () => {
      findButtonByText('全选')?.click()
    })
    await act(async () => {
      findButtonByText('下载')?.click()
      await flushPromises()
    })

    expect(notify).toHaveBeenCalledWith('已保存 2 张图片到所选文件夹')
    expect(notify).toHaveBeenCalledWith('文件位置打开失败：denied')

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })
})

function findButtonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes(text))
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

