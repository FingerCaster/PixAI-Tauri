import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetPlatformStateForTests,
  imageSourceForDisplay,
  imageSourceForDisplaySync,
  getSystemNotificationPermission,
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
})

function restoreWindowProperty(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(window, name, descriptor)
    return
  }
  Reflect.deleteProperty(window, name)
}
