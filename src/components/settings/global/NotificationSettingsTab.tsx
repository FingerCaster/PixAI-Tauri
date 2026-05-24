import { useEffect } from 'react'
import { useAppStore } from '../../../store/app-store'
import { SettingsToggleRow } from '../SettingsToggleRow'

export function NotificationSettingsTab() {
  const {
    preferences,
    updatePreferences,
    requestNotificationPermission,
    refreshNotificationPermission
  } = useAppStore()

  useEffect(() => {
    if (!preferences?.notifyOnImageSuccess) return
    void refreshNotificationPermission()
  }, [preferences?.notifyOnImageSuccess, refreshNotificationPermission])

  if (!preferences) return null

  const notificationPermissionLabel = getNotificationPermissionLabel(preferences.notificationPermission)
  const showNotificationPermissionWarning = preferences.notifyOnImageSuccess && preferences.notificationPermission !== 'granted'

  return (
    <section className="settings-status-card">
      <div className="section-title">
        <h2>通知状态</h2>
        <span className={`pill tiny ${preferences.notificationPermission === 'granted' ? 'good' : 'warn'}`}>
          {notificationPermissionLabel}
        </span>
      </div>
      <div className="toggle-stack">
        <SettingsToggleRow
          label="生图完成通知"
          help="开启后，PixAI 失焦时每次生图结束都会发送系统通知，成功或失败都会提示。"
          checked={preferences.notifyOnImageSuccess}
          onChange={() => void updatePreferences({ notifyOnImageSuccess: !preferences.notifyOnImageSuccess })}
        />
      </div>
      {showNotificationPermissionWarning ? (
        <div className="settings-warning">
          <span>系统通知权限未开启，生成结束时会退回应用内提示。</span>
          <button type="button" onClick={() => void requestNotificationPermission()}>
            开启权限
          </button>
        </div>
      ) : null}
    </section>
  )
}

function getNotificationPermissionLabel(permission: string): string {
  if (permission === 'granted') return '系统已允许'
  if (permission === 'denied') return '系统已拒绝'
  if (permission === 'unsupported') return '不支持'
  return '待授权'
}
