import type { ReactNode } from 'react'
import { BookOpen, GalleryHorizontalEnd, ImagePlus, Moon, Settings, Sun, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import appLogo from '../../assets/app-logo.png'
import { useAppStore } from '../../store/app-store'
import type { GlobalSettingsTab } from '../settings/global/GlobalSettingsModal'

export function AppTopNav({
  onOpenGlobalSettings,
  workspaceActions
}: {
  onOpenGlobalSettings: (tab?: GlobalSettingsTab) => void
  workspaceActions?: ReactNode
}) {
  const { darkMode, openCanvasWorkspace, setView, toggleTheme, view } = useAppStore()

  return (
    <header className="topbar flex h-16 shrink-0 items-center gap-3 border-b border-border/80 bg-background/86 px-4 backdrop-blur">
      <div className="brand flex w-[248px] shrink-0 items-center gap-3">
        <img className="brand-mark size-9 rounded-xl border border-border bg-card p-1.5 shadow-sm" src={appLogo} alt="" />
        <div className="leading-tight">
          <strong className="block text-base font-semibold">PixAI</strong>
          <span className="text-xs text-muted-foreground">Image workbench</span>
        </div>
      </div>
      <nav className="top-actions ml-auto flex items-center gap-2">
        {workspaceActions}
        <Button variant={view === 'workspace' ? 'secondary' : 'ghost'} type="button" onClick={() => setView('workspace')}>
          <ImagePlus />
          工作台
        </Button>
        <Button variant={view === 'canvas' ? 'secondary' : 'ghost'} type="button" onClick={() => void openCanvasWorkspace()}>
          <Workflow />
          Canvas
        </Button>
        <Button variant={view === 'gallery' ? 'secondary' : 'ghost'} type="button" onClick={() => setView('gallery')}>
          <GalleryHorizontalEnd />
          图库
        </Button>
        <Button variant={view === 'prompts' ? 'secondary' : 'ghost'} type="button" onClick={() => setView('prompts')}>
          <BookOpen />
          提示词库
        </Button>
        <Button className="icon-button" variant="outline" size="icon" type="button" onClick={toggleTheme} title="切换主题">
          {darkMode ? <Sun /> : <Moon />}
        </Button>
        <Button className="icon-button" variant="outline" size="icon" type="button" onClick={() => onOpenGlobalSettings('general')} title="全局设置">
          <Settings />
        </Button>
      </nav>
    </header>
  )
}
