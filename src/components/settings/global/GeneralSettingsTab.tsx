import { useAppStore } from '../../../store/app-store'
import { AppUpdateSection } from '../AppUpdateSection'
import { SettingsToggleRow } from '../SettingsToggleRow'

export function GeneralSettingsTab() {
  const {
    preferences,
    updatePreferences,
    appUpdate,
    checkForAppUpdate,
    downloadAndInstallAppUpdate
  } = useAppStore()

  if (!preferences) return null

  return (
    <>
      <section className="settings-status-card">
        <div className="section-title">
          <h2>窗口与托盘</h2>
          <span className="pill tiny">常规</span>
        </div>
        <div className="toggle-stack">
          <SettingsToggleRow
            label="关闭到系统托盘"
            help="开启后点击窗口关闭按钮会隐藏到托盘，托盘图标可恢复窗口或退出应用。"
            checked={preferences.closeToTray}
            onChange={() => void updatePreferences({ closeToTray: !preferences.closeToTray })}
          />
        </div>
      </section>
      <AppUpdateSection
        appUpdate={appUpdate}
        onCheck={() => void checkForAppUpdate({ silent: false })}
        onInstall={() => void downloadAndInstallAppUpdate()}
        variant="card"
      />
    </>
  )
}
