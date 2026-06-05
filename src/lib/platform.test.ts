import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetPlatformStateForTests,
  downloadImageSource,
  downloadTextFile,
  fetchMultipartTextStreamThroughPlatform,
  fetchTextStreamThroughPlatform,
  getSystemNotificationPermission,
  imageSourceForDisplay,
  imageSourceForDisplaySync,
  readRemoteImageUrl,
  readTextFile,
  requestSystemNotificationPermission
} from './platform'

type TauriStreamPayload = {
  streamId: string
  kind: 'chunk' | 'done' | 'error'
  status?: number
  statusText?: string
  chunkBase64?: string
  error?: string
}

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

  it('downloads text files through the same browser download path', async () => {
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    const downloadedBlobs: Blob[] = []
    const createObjectUrl = vi.fn((blob: Blob) => {
      downloadedBlobs.push(blob)
      return 'blob:pixai-json-download'
    })
    const revokeObjectUrl = vi.fn()
    const clicked: HTMLAnchorElement[] = []
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      clicked.push(this)
    })
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectUrl, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectUrl, configurable: true })

    try {
      await downloadTextFile('project.json', '{"ok":true}', 'application/json')

      expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
      await expect(readBlobTextForTest(downloadedBlobs[0])).resolves.toBe('{"ok":true}')
      expect(clicked[0].download).toBe('project.json')
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:pixai-json-download')
    } finally {
      clickSpy.mockRestore()
      Object.defineProperty(URL, 'createObjectURL', { value: originalCreateObjectUrl, configurable: true })
      Object.defineProperty(URL, 'revokeObjectURL', { value: originalRevokeObjectUrl, configurable: true })
    }
  })

  it('reads text files and rejects FileReader failures', async () => {
    await expect(readTextFile(new File(['{"ok":true}'], 'project.json', { type: 'application/json' }))).resolves.toBe('{"ok":true}')

    const originalFileReader = globalThis.FileReader
    class FailingFileReader {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      error = new Error('read failed')
      readAsText() {
        this.onerror?.()
      }
    }
    Object.defineProperty(globalThis, 'FileReader', {
      value: FailingFileReader,
      configurable: true
    })

    try {
      await expect(readTextFile(new File(['bad'], 'bad.json'))).rejects.toThrow('read failed')
    } finally {
      Object.defineProperty(globalThis, 'FileReader', {
        value: originalFileReader,
        configurable: true
      })
    }
  })
})

describe('platform text streams', () => {
  const originalFetch = globalThis.fetch
  const originalTauriDescriptor = Object.getOwnPropertyDescriptor(window, '__TAURI_INTERNALS__')
  const originalEventDescriptor = Object.getOwnPropertyDescriptor(window, '__TAURI_EVENT_PLUGIN_INTERNALS__')

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      configurable: true,
      writable: true
    })
    restoreWindowProperty('__TAURI_INTERNALS__', originalTauriDescriptor)
    restoreWindowProperty('__TAURI_EVENT_PLUGIN_INTERNALS__', originalEventDescriptor)
  })

  it('emits browser response body chunks while preserving the final text', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: one\n\n'))
        controller.enqueue(encoder.encode('data: two\n\n'))
        controller.close()
      }
    })
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn().mockResolvedValue(new Response(stream, { status: 202, statusText: 'Accepted' })),
      configurable: true,
      writable: true
    })
    const chunks: string[] = []

    const response = await fetchTextStreamThroughPlatform('https://example.com/stream', { method: 'POST' }, {
      onTextChunk: (chunk) => chunks.push(chunk)
    })

    expect(response).toMatchObject({ status: 202, statusText: 'Accepted' })
    expect(response.text).toBe('data: one\n\ndata: two\n\n')
    expect(chunks.join('')).toBe(response.text)
  })

  it('keeps browser streams alive when chunk observers throw', async () => {
    const encoder = new TextEncoder()
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('ok'))
          controller.close()
        }
      }))),
      configurable: true,
      writable: true
    })

    await expect(fetchTextStreamThroughPlatform('https://example.com/stream', { method: 'POST' }, {
      onTextChunk: () => {
        throw new Error('observer failed')
      }
    })).resolves.toMatchObject({ text: 'ok' })
  })

  it('emits Tauri stream proxy chunks while preserving the final text', async () => {
    const callbacks = new Map<number, (event: { payload: TauriStreamPayload }) => void>()
    let nextCallbackId = 1
    const invoke = vi.fn(async (command: string, args?: { request?: { streamId?: string } }) => {
      if (command === 'plugin:event|listen') return 1
      if (command === 'plugin:event|unlisten') return undefined
      if (command !== 'http_proxy_stream') throw new Error(`unexpected command ${command}`)
      const streamId = args?.request?.streamId || ''
      const streamHandler = callbacks.values().next().value
      streamHandler?.({
        payload: {
          streamId,
          kind: 'chunk',
          status: 200,
          statusText: 'OK',
          chunkBase64: btoa('alpha')
        }
      })
      streamHandler?.({
        payload: {
          streamId,
          kind: 'chunk',
          chunkBase64: btoa(' beta')
        }
      })
      streamHandler?.({
        payload: {
          streamId,
          kind: 'done',
          status: 200,
          statusText: 'OK'
        }
      })
    })
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        invoke,
        transformCallback: (handler: (event: { payload: TauriStreamPayload }) => void) => {
          const id = nextCallbackId
          nextCallbackId += 1
          callbacks.set(id, handler)
          return id
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id)
        }
      },
      configurable: true
    })
    Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', {
      value: {
        unregisterListener: vi.fn()
      },
      configurable: true
    })
    const chunks: string[] = []

    const response = await fetchMultipartTextStreamThroughPlatform('https://example.com/stream', {
      method: 'POST',
      body: new FormData()
    }, {
      onTextChunk: (chunk) => chunks.push(chunk)
    })

    expect(response.text).toBe('alpha beta')
    expect(chunks.join('')).toBe('alpha beta')
    expect(invoke).toHaveBeenCalledWith('http_proxy_stream', expect.anything(), undefined)
  })
})

describe('remote reference image url reads', () => {
  const originalFetch = globalThis.fetch
  const originalTauriDescriptor = Object.getOwnPropertyDescriptor(window, '__TAURI_INTERNALS__')

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      configurable: true,
      writable: true
    })
    restoreWindowProperty('__TAURI_INTERNALS__', originalTauriDescriptor)
  })

  it('downloads an HTTPS image into a reference image payload', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'content-type': 'image/webp',
        'content-length': '3'
      }
    }))
    Object.defineProperty(globalThis, 'fetch', { value: fetch, configurable: true, writable: true })

    const payload = await readRemoteImageUrl(' https://example.com/cat.webp ')

    expect(fetch).toHaveBeenCalledWith('https://example.com/cat.webp', {
      headers: { Accept: 'image/png,image/jpeg,image/webp' }
    })
    expect(payload).toEqual({
      name: 'cat.webp',
      mimeType: 'image/webp',
      dataUrl: 'data:image/webp;base64,AQID',
      fileSizeBytes: 3
    })
  })

  it('accepts HTTP image urls through the same conversion path', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([4, 5]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' }
    }))
    Object.defineProperty(globalThis, 'fetch', { value: fetch, configurable: true, writable: true })

    const payload = await readRemoteImageUrl('http://127.0.0.1:3000/image')

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:3000/image', {
      headers: { Accept: 'image/png,image/jpeg,image/webp' }
    })
    expect(payload.name).toBe('image.jpg')
    expect(payload.mimeType).toBe('image/jpeg')
    expect(payload.dataUrl).toBe('data:image/jpeg;base64,BAU=')
  })

  it('rejects non HTTP or HTTPS urls before fetching', async () => {
    const fetch = vi.fn()
    Object.defineProperty(globalThis, 'fetch', { value: fetch, configurable: true, writable: true })

    await expect(readRemoteImageUrl('ftp://example.com/cat.png')).rejects.toThrow('仅支持 HTTP/HTTPS 图片链接。')

    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects failing HTTP responses with the status code', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn().mockResolvedValue(new Response('missing', { status: 404 })),
      configurable: true,
      writable: true
    })

    await expect(readRemoteImageUrl('https://example.com/missing.png')).rejects.toThrow('图片链接下载失败：HTTP 404。')
  })

  it('rejects HTML responses as non-reference images', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn().mockResolvedValue(new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      })),
      configurable: true,
      writable: true
    })

    await expect(readRemoteImageUrl('https://example.com/page')).rejects.toThrow('仅支持 PNG、JPG、WEBP 参考图。')
  })

  it('rejects over-limit content-length before reading the response body', async () => {
    const getReader = vi.fn()
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'image/png',
        'content-length': String(20 * 1024 * 1024 + 1)
      }),
      body: { getReader },
      arrayBuffer: vi.fn()
    } as unknown as Response
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn().mockResolvedValue(response),
      configurable: true,
      writable: true
    })

    await expect(readRemoteImageUrl('https://example.com/huge.png')).rejects.toThrow('单张参考图不能超过 20MB。')

    expect(getReader).not.toHaveBeenCalled()
  })

  it('cancels a stream once accumulated bytes exceed the image limit', async () => {
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array(11 * 1024 * 1024) })
        .mockResolvedValueOnce({ done: false, value: new Uint8Array(10 * 1024 * 1024) }),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn()
    }
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      body: { getReader: () => reader },
      arrayBuffer: vi.fn()
    } as unknown as Response
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn().mockResolvedValue(response),
      configurable: true,
      writable: true
    })

    await expect(readRemoteImageUrl('https://example.com/stream.png')).rejects.toThrow('单张参考图不能超过 20MB。')

    expect(reader.read).toHaveBeenCalledTimes(2)
    expect(reader.cancel).toHaveBeenCalledTimes(1)
    expect(reader.releaseLock).toHaveBeenCalledTimes(1)
  })
})

function restoreWindowProperty(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(window, name, descriptor)
    return
  }
  Reflect.deleteProperty(window, name)
}

function readBlobTextForTest(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Unable to read blob.'))
    reader.readAsText(blob)
  })
}
