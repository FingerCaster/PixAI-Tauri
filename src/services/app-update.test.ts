import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { check } from '@tauri-apps/plugin-updater'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppUpdateService } from './app-update'

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn()
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn()
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn()
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn()
}))

const latestReleaseHtml = `
  <html>
    <head>
      <meta property="og:url" content="/FingerCaster/PixAI-Tauri/releases/tag/0.0.2" />
      <meta property="og:description" content="PixAI 0.0.2 release." />
    </head>
    <body>
      <relative-time datetime="2026-05-24T00:00:00Z"></relative-time>
    </body>
  </html>
`

const expandedAssetsHtml = `
  <a href="/FingerCaster/PixAI-Tauri/releases/download/0.0.2/PixAI_0.0.2_x64_en-US.msi">PixAI_0.0.2_x64_en-US.msi</a>
  <a href="/FingerCaster/PixAI-Tauri/releases/download/0.0.2/PixAI_0.0.2_x64-setup.exe">PixAI_0.0.2_x64-setup.exe</a>
`

describe('AppUpdateService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(getVersion).mockResolvedValue('0.0.1')
    vi.mocked(openUrl).mockResolvedValue(undefined)
    vi.mocked(check).mockRejectedValue(new Error('HTTP status client error (404 Not Found): latest.json'))
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        invoke: vi.fn(async (command: string, args?: { request?: { url?: string } }) => {
          if (command !== 'http_proxy') throw new Error(`unexpected command ${command}`)
          const url = args?.request?.url || ''
          if (url.endsWith('/releases/latest')) {
            return { status: 200, status_text: 'OK', body: latestReleaseHtml }
          }
          if (url.endsWith('/releases/expanded_assets/0.0.2')) {
            return { status: 200, status_text: 'OK', body: expandedAssetsHtml }
          }
          return { status: 404, status_text: 'Not Found', body: '' }
        })
      },
      configurable: true
    })
  })

  it('falls back to the GitHub release page when latest.json is missing', async () => {
    const result = await new AppUpdateService().check()

    expect(result.currentVersion).toBe('0.0.1')
    expect(result.update).toMatchObject({
      version: '0.0.2',
      date: '2026-05-24T00:00:00Z',
      notes: 'PixAI 0.0.2 release.',
      installMode: 'github',
      releaseUrl: 'https://github.com/FingerCaster/PixAI-Tauri/releases/tag/0.0.2',
      downloadUrl: 'https://github.com/FingerCaster/PixAI-Tauri/releases/download/0.0.2/PixAI_0.0.2_x64-setup.exe'
    })
  })

  it('falls back when updater returns a serialized release-not-found error object', async () => {
    vi.mocked(check).mockRejectedValue({
      kind: 'ReleaseNotFound',
      message: 'Could not fetch a valid release JSON from the remote'
    })

    const result = await new AppUpdateService().check()

    expect(result.update).toMatchObject({
      version: '0.0.2',
      installMode: 'github',
      downloadUrl: 'https://github.com/FingerCaster/PixAI-Tauri/releases/download/0.0.2/PixAI_0.0.2_x64-setup.exe'
    })
  })

  it('opens the selected GitHub installer after a fallback update check', async () => {
    const service = new AppUpdateService()

    await service.check()
    await expect(service.downloadAndInstall()).resolves.toEqual({ action: 'openedDownload' })

    expect(openUrl).toHaveBeenCalledWith('https://github.com/FingerCaster/PixAI-Tauri/releases/download/0.0.2/PixAI_0.0.2_x64-setup.exe')
  })
})
