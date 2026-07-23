import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { pixaiApi } from '../../services/app-api'
import { useAppStore } from '../../store/app-store'

type DownloadedFolderPrompt = {
  directory: string
  paths: string[]
  savedCount: number
}

export type DownloadedLocation = {
  directory: string
  paths?: string[]
}

export function useDownloadedFolderPrompt() {
  const { preferences, notify, updatePreferences } = useAppStore()
  const [prompt, setPrompt] = useState<DownloadedFolderPrompt | null>(null)
  const [remember, setRemember] = useState(false)

  const handleDownloadedLocation = async (location: DownloadedLocation, savedCount: number) => {
    const behavior = preferences?.downloadOpenFolderBehavior || 'ask'
    if (behavior === 'always') {
      await revealDownloadedLocation(location, notify)
      return
    }
    if (behavior === 'never') return
    setRemember(false)
    setPrompt({ directory: location.directory, paths: location.paths || [], savedCount })
  }

  const confirmOpenDownloadedDirectory = async (openFolder: boolean) => {
    const currentPrompt = prompt
    if (!currentPrompt) return
    setPrompt(null)
    const preferenceUpdate = remember
      ? updatePreferences({ downloadOpenFolderBehavior: openFolder ? 'always' : 'never' }).catch((error) => {
        notify(error instanceof Error ? `打开文件夹偏好保存失败：${error.message}` : '打开文件夹偏好保存失败')
      })
      : null
    if (openFolder) {
      await revealDownloadedLocation(currentPrompt, notify)
      await preferenceUpdate
      return
    }
    await preferenceUpdate
  }

  return {
    handleDownloadedLocation,
    downloadedFolderPrompt: (
      <OpenDownloadedFolderDialog
        prompt={prompt}
        remember={remember}
        onRememberChange={setRemember}
        onOpenFolder={() => void confirmOpenDownloadedDirectory(true)}
        onSkip={() => void confirmOpenDownloadedDirectory(false)}
        onClose={() => setPrompt(null)}
      />
    )
  }
}

async function revealDownloadedLocation(location: DownloadedLocation, notify: (message: string | null) => void) {
  try {
    await pixaiApi.shell.revealPaths(location.paths?.length ? location.paths : [location.directory])
  } catch (error) {
    notify(error instanceof Error ? `文件位置打开失败：${error.message}` : '文件位置打开失败')
  }
}

function OpenDownloadedFolderDialog({
  prompt,
  remember,
  onRememberChange,
  onOpenFolder,
  onSkip,
  onClose
}: {
  prompt: DownloadedFolderPrompt | null
  remember: boolean
  onRememberChange: (remember: boolean) => void
  onOpenFolder: () => void
  onSkip: () => void
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(prompt)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="download-folder-dialog max-w-md" aria-label="下载完成" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>下载完成</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            已保存 {prompt?.savedCount || 0} 张图片。要打开保存位置吗？
          </p>
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <Checkbox checked={remember} onCheckedChange={(checked) => onRememberChange(checked === true)} aria-label="不再打扰" />
            不再打扰，记住这次选择
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onSkip}>
            不用打开
          </Button>
          <Button type="button" onClick={onOpenFolder}>
            打开位置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
