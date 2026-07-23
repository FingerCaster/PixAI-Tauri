import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { DownloadOpenFolderBehavior } from '../../../shared/types'
import { useAppStore } from '../../../store/app-store'
import { AppUpdateSection } from '../AppUpdateSection'
import { SettingsToggleRow } from '../SettingsToggleRow'

const DOWNLOAD_OPEN_FOLDER_OPTIONS: Array<{ value: DownloadOpenFolderBehavior; label: string; help: string }> = [
  { value: 'ask', label: '每次询问', help: '批量下载完成后弹窗确认是否打开文件夹。' },
  { value: 'always', label: '总是打开', help: '批量下载完成后直接打开保存文件夹。' },
  { value: 'never', label: '从不打开', help: '批量下载完成后只显示保存结果。' }
]

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
      <Card className="settings-status-card rounded-2xl shadow-none">
        <CardHeader className="section-title flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">窗口与托盘</CardTitle>
          <Badge variant="outline" className="pill tiny">常规</Badge>
        </CardHeader>
        <CardContent>
        <div className="toggle-stack grid gap-2">
          <SettingsToggleRow
            label="关闭到系统托盘"
            help="开启后点击窗口关闭按钮会隐藏到托盘，托盘图标可恢复窗口或退出应用。"
            checked={preferences.closeToTray}
            onChange={() => void updatePreferences({ closeToTray: !preferences.closeToTray })}
          />
          <div className="toggle-row flex min-h-11 w-full items-center justify-between gap-4 rounded-lg border border-border bg-card px-3 py-2">
            <span className="grid min-w-0 gap-1">
              <span className="truncate text-sm font-medium text-foreground">下载后打开文件夹</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {DOWNLOAD_OPEN_FOLDER_OPTIONS.find((option) => option.value === preferences.downloadOpenFolderBehavior)?.help}
              </span>
            </span>
            <Select
              value={preferences.downloadOpenFolderBehavior}
              onValueChange={(value) => void updatePreferences({ downloadOpenFolderBehavior: value as DownloadOpenFolderBehavior })}
            >
              <SelectTrigger className="w-32 shrink-0" size="sm" aria-label="下载后打开文件夹">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {DOWNLOAD_OPEN_FOLDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        </CardContent>
      </Card>
      <AppUpdateSection
        appUpdate={appUpdate}
        onCheck={() => void checkForAppUpdate({ silent: false })}
        onInstall={() => void downloadAndInstallAppUpdate()}
        variant="card"
      />
    </>
  )
}
