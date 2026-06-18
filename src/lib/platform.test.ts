import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetPlatformStateForTests,
  copyImageSourceToClipboard,
  downloadImageSource,
  getSystemNotificationPermission,
  imageSourceForDisplay,
  imageSourceForDisplaySync,
  readRemoteImageUrl,
  requestSystemNotificationPermission
} from './platform'

describe('platform notification permissions', () => {
  const originalNotificationDescriptor = Object.getOwnPropertyDescriptor(window, 'Notification')
  const originalTauriDescriptor = Object.getOwnPropertyDescriptor(window, '__TAURI_INTERNALS__')

  afterEach(() => {
    restoreWindowProperty('Notification', originalNotificationDescriptor)
    restoreWindowProperty('__TAURI_INTERNALS__', originalTauriDescriptor)
    __resetPlatformStateForTests()
  })

  it('treats Tauri desktop notifications as granted without trusting WebView Notification state', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true
    })
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'denied', requestPermission: async () => 'denied' },
      configurable: true
    })

    await expect(getSystemNotificationPermission()).resolves.toBe('granted')
    await expect(requestSystemNotificationPermission()).resolves.toBe('granted')
  })
})

describe('platform image display sources', () => {
  it('returns cached local image sources synchronously after the first async load', async () => {
    await imageSourceForDisplay('data:image/png;base64,aGVsbG8=', 'browser-memory/images/example.png')

    expect(imageSourceForDisplaySync(null, 'browser-memory/images/example.png')).toBe('data:image/png;base64,aGVsbG8=')
  })

  it('downloads data urls through a temporary object url instead of navigating to the image', async () => {
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    const createObjectUrl = vi.fn(() => 'blob:pixai-download')
    const revokeObjectUrl = vi.fn()
    const clicked: HTMLAnchorElement[] = []
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      clicked.push(this)
    })
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectUrl, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectUrl, configurable: true })

    try {
      await downloadImageSource('data:image/png;base64,aGVsbG8=', 'image.png')

      expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
      expect(clicked).toHaveLength(1)
      expect(clicked[0].href).toBe('blob:pixai-download')
      expect(clicked[0].download).toBe('image.png')
      expect(clicked[0].isConnected).toBe(false)
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:pixai-download')
    } finally {
      clickSpy.mockRestore()
      Object.defineProperty(URL, 'createObjectURL', { value: originalCreateObjectUrl, configurable: true })
      Object.defineProperty(URL, 'revokeObjectURL', { value: originalRevokeObjectUrl, configurable: true })
    }
  })

  it('downloads remote image urls as base64 data urls in browser runtime', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'content-type': 'image/png',
            'content-length': '3'
          }
        })
      )
    )

    const payload = await readRemoteImageUrl('https://example.test/generated.png')

    expect(fetch).toHaveBeenCalledWith('https://example.test/generated.png', {
      headers: { Accept: 'image/png,image/jpeg,image/webp' }
    })
    expect(payload).toEqual({
      name: 'generated.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AQID',
      fileSizeBytes: 3
    })
  })

  it('falls back to text when clipboard image writes are rejected', async () => {
    const write = vi.fn().mockRejectedValue(new Error('image denied'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    const OriginalClipboardItem = globalThis.ClipboardItem
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write, writeText }
    })
    vi.stubGlobal('ClipboardItem', class ClipboardItemMock {
      constructor(readonly items: Record<string, Blob>) {}
    })

    try {
      const result = await copyImageSourceToClipboard('data:image/png;base64,aGVsbG8=')

      expect(result).toEqual({ copied: 'data' })
      expect(write).toHaveBeenCalledWith([expect.any(ClipboardItem)])
      expect(writeText).toHaveBeenCalledWith('data:image/png;base64,aGVsbG8=')
    } finally {
      vi.stubGlobal('ClipboardItem', OriginalClipboardItem)
    }
  })

  it('falls back to text when image bytes cannot be resolved', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    const result = await copyImageSourceToClipboard('https://example.test/image.png')

    expect(result).toEqual({ copied: 'url' })
    expect(writeText).toHaveBeenCalledWith('https://example.test/image.png')
  })

  it('classifies stored path clipboard fallbacks separately from image copy success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })

    const result = await copyImageSourceToClipboard(null, 'C:\\PixAI\\stored\\image.png')

    expect(result).toEqual({ copied: 'path' })
    expect(writeText).toHaveBeenCalledWith('C:\\PixAI\\stored\\image.png')
  })
})

function restoreWindowProperty(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(window, name, descriptor)
    return
  }
  Reflect.deleteProperty(window, name)
}
