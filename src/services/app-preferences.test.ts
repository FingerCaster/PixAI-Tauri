import { describe, expect, it } from 'vitest'
import { __setNotificationPermissionForTests } from '../lib/platform'
import { AppPreferencesStore } from './app-preferences'

describe('AppPreferencesStore', () => {
  it('defaults successful image notifications to disabled and close-to-tray to enabled', async () => {
    const store = new AppPreferencesStore()

    const preferences = await store.get()

    expect(preferences.notifyOnImageSuccess).toBe(false)
    expect(preferences.closeToTray).toBe(true)
    expect(preferences.downloadOpenFolderBehavior).toBe('ask')
    expect(preferences.notificationPermission).toBe('unsupported')
  })

  it('persists successful image notification preference changes', async () => {
    const store = new AppPreferencesStore()

    await store.update({ notifyOnImageSuccess: true, closeToTray: false, downloadOpenFolderBehavior: 'always' })

    await expect(new AppPreferencesStore().get()).resolves.toMatchObject({
      notifyOnImageSuccess: true,
      closeToTray: false,
      downloadOpenFolderBehavior: 'always'
    })
  })

  it('normalizes invalid download folder preferences to ask', async () => {
    const store = new AppPreferencesStore()

    await store.update({ downloadOpenFolderBehavior: 'never' })
    const updated = await store.update({ downloadOpenFolderBehavior: 'invalid' as never })

    expect(updated.downloadOpenFolderBehavior).toBe('ask')
    await expect(new AppPreferencesStore().get()).resolves.toMatchObject({
      downloadOpenFolderBehavior: 'ask'
    })
  })

  it('refreshes stored notification permission status', async () => {
    __setNotificationPermissionForTests('denied')
    const store = new AppPreferencesStore()

    const preferences = await store.refreshNotificationPermission()

    expect(preferences.notificationPermission).toBe('denied')
  })
})
