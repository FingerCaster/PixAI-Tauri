import { act, type ChangeEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/app-store'
import { GeneralSettingsTab } from './GeneralSettingsTab'

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children
  }: {
    value: string
    onValueChange: (value: string) => void
    children: ReactNode
  }) => (
    <select
      aria-label="下载后打开文件夹"
      value={value}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onValueChange(event.currentTarget.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null
}))

vi.mock('../AppUpdateSection', () => ({
  AppUpdateSection: () => <section aria-label="应用更新" />
}))

vi.mock('../SettingsToggleRow', () => ({
  SettingsToggleRow: ({ label }: { label: string }) => <div>{label}</div>
}))

describe('GeneralSettingsTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useAppStore.setState({
      preferences: {
        notifyOnImageSuccess: false,
        closeToTray: true,
        downloadOpenFolderBehavior: 'ask',
        notificationPermission: 'unsupported'
      },
      appUpdate: {
        status: 'idle',
        currentVersion: '0.0.15',
        platform: 'browser',
        runtime: 'browser',
        availableUpdate: null,
        lastCheckedAt: null,
        errorMessage: null,
        downloadedBytes: null,
        contentLength: null
      },
      updatePreferences: vi.fn().mockResolvedValue(undefined),
      checkForAppUpdate: vi.fn().mockResolvedValue(undefined),
      downloadAndInstallAppUpdate: vi.fn().mockResolvedValue(undefined)
    })
  })

  it('saves the download open-folder behavior from settings', async () => {
    const updatePreferences = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({ updatePreferences })
    const { host, root } = await renderTab()
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="下载后打开文件夹"]')

    expect(select?.value).toBe('ask')

    await act(async () => {
      if (!select) return
      select.value = 'always'
      select.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
    })

    expect(updatePreferences).toHaveBeenCalledWith({ downloadOpenFolderBehavior: 'always' })

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })
})

async function renderTab() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<GeneralSettingsTab />)
  })
  return { host, root }
}
