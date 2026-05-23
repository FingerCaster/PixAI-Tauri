import { afterEach, describe, expect, it } from 'vitest'
import { getSystemNotificationPermission, requestSystemNotificationPermission } from './platform'

describe('platform notification permissions', () => {
  const originalNotificationDescriptor = Object.getOwnPropertyDescriptor(window, 'Notification')
  const originalTauriDescriptor = Object.getOwnPropertyDescriptor(window, '__TAURI_INTERNALS__')

  afterEach(() => {
    restoreWindowProperty('Notification', originalNotificationDescriptor)
    restoreWindowProperty('__TAURI_INTERNALS__', originalTauriDescriptor)
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

function restoreWindowProperty(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(window, name, descriptor)
    return
  }
  Reflect.deleteProperty(window, name)
}
