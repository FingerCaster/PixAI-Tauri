import { Download, RefreshCw } from 'lucide-react'
import type { AppUpdateState } from '../../shared/types'

type AppUpdateSectionProps = {
  appUpdate: AppUpdateState
  onCheck: () => void
  onInstall: () => void
}

export function AppUpdateSection({ appUpdate, onCheck, onInstall }: AppUpdateSectionProps) {
  const checking = appUpdate.status === 'checking'
  const installing = appUpdate.status === 'downloading' || appUpdate.status === 'installing'
  const canInstall = appUpdate.status === 'available' && Boolean(appUpdate.availableUpdate)
  const status = getUpdateStatusText(appUpdate)
  const progressText = getProgressText(appUpdate)

  return (
    <section className="settings-section">
      <div className="section-title">
        <h2>关于应用 / 更新</h2>
        <span className={`pill tiny ${appUpdate.status === 'available' ? 'warn' : appUpdate.status === 'error' ? 'bad' : 'good'}`}>
          {status.badge}
        </span>
      </div>
      <div className="app-update-card">
        <div className="app-update-version">
          <span>当前版本</span>
          <strong>v{appUpdate.currentVersion}</strong>
        </div>
        {appUpdate.availableUpdate ? (
          <div className="app-update-version">
            <span>可用版本</span>
            <strong>v{appUpdate.availableUpdate.version}</strong>
          </div>
        ) : null}
        <p>{status.message}</p>
        {appUpdate.availableUpdate?.notes ? <p className="app-update-notes">{appUpdate.availableUpdate.notes}</p> : null}
        {progressText ? <div className="status-line">{progressText}</div> : null}
        {appUpdate.lastCheckedAt ? <div className="status-line">上次检查：{formatDateTime(appUpdate.lastCheckedAt)}</div> : null}
      </div>
      <div className="button-row app-update-actions">
        <button type="button" onClick={onCheck} disabled={checking || installing}>
          <RefreshCw className={checking ? 'spin' : ''} size={15} />
          {checking ? '检查中' : '检查更新'}
        </button>
        <button className="primary-button" type="button" onClick={onInstall} disabled={!canInstall || installing}>
          <Download size={15} />
          {installing ? '更新中' : appUpdate.availableUpdate?.installMode === 'github' ? '打开下载' : '下载并重启'}
        </button>
      </div>
    </section>
  )
}

function getUpdateStatusText(appUpdate: AppUpdateState): { badge: string; message: string } {
  if (appUpdate.status === 'checking') return { badge: '检查中', message: '正在检查是否有新版本。' }
  if (appUpdate.status === 'available' && appUpdate.availableUpdate) {
    return {
      badge: '有更新',
      message: appUpdate.availableUpdate.installMode === 'github'
        ? `发现 GitHub Release 新版本 v${appUpdate.availableUpdate.version}。`
        : `发现新版本 v${appUpdate.availableUpdate.version}。`
    }
  }
  if (appUpdate.status === 'downloading') return { badge: '下载中', message: '正在下载更新包，请保持应用打开。' }
  if (appUpdate.status === 'installing') return { badge: '安装中', message: '更新已安装，正在准备重启。' }
  if (appUpdate.status === 'error') return { badge: '需重试', message: appUpdate.errorMessage || '检查更新失败，可以稍后重试。' }
  if (appUpdate.status === 'upToDate') return { badge: '最新', message: '当前已是最新版本。' }
  return { badge: '待检查', message: appUpdate.runtime === 'tauri' ? '尚未检查更新。' : '更新检查仅在桌面应用中可用。' }
}

function getProgressText(appUpdate: AppUpdateState): string | null {
  if (appUpdate.status !== 'downloading') return null
  const downloaded = appUpdate.downloadedBytes
  const total = appUpdate.contentLength
  if (downloaded == null) return '正在下载更新包'
  if (!total) return `已下载 ${formatBytes(downloaded)}`
  return `已下载 ${formatBytes(downloaded)} / ${formatBytes(total)}`
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
