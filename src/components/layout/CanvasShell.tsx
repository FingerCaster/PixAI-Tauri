import type { ReactNode } from 'react'
import { ArrowRight, Download, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { confirmDestructiveAction } from '../../lib/confirm'
import { useAppStore } from '../../store/app-store'
import { useCanvasStore } from '../../store/canvas-store'
import type { GlobalSettingsTab } from '../settings/global/GlobalSettingsModal'
import { AppTopNav } from './AppTopNav'

export function CanvasShell({
  children,
  onOpenGlobalSettings
}: {
  children: ReactNode
  onOpenGlobalSettings: (tab?: GlobalSettingsTab) => void
}) {
  const { appUpdate, createCanvasProject, deleteCanvasProject, openCanvasProject } = useAppStore()
  const canvasProjects = useCanvasStore((state) => state.projects)
  const activeCanvasProjectId = useCanvasStore((state) => state.activeProjectId)
  const confirmDeleteCanvasProject = () => confirmDestructiveAction('确认删除这个 Canvas 项目？项目绑定的专属会话会一起删除，历史图片会保留在图库。')
  const hasAvailableUpdate = appUpdate.status === 'available' && Boolean(appUpdate.availableUpdate)

  return (
    <div className="shell app-frame flex h-dvh min-h-[720px] min-w-[1080px] flex-col overflow-hidden bg-[radial-gradient(circle_at_0%_0%,hsl(var(--primary)/0.09),transparent_28%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--secondary)/0.55))]">
      <AppTopNav onOpenGlobalSettings={onOpenGlobalSettings} />
      <div className="main-grid grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
        <aside className="sidebar flex min-h-0 flex-col border-r border-border/80 bg-card/82">
          <div className="flex h-12 shrink-0 items-center justify-between px-4">
            <div className="section-title text-xs font-semibold uppercase tracking-wide text-muted-foreground">Canvas 项目</div>
            <Badge variant="outline">{canvasProjects.length}</Badge>
          </div>
          <div className="px-3 pb-3">
            <Button className="w-full justify-start" type="button" onClick={() => void createCanvasProject()}>
              <Plus />
              新建 Canvas 项目
            </Button>
          </div>
          <ScrollArea className="session-list min-h-0 flex-1 px-3">
            <div className="grid gap-2 pb-3">
              {canvasProjects.map((project) => {
                const active = project.id === activeCanvasProjectId
                return (
                  <button
                    key={project.id}
                    className={cn(
                      'session group flex min-h-16 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                      active ? 'active border-primary/35 bg-primary/10 text-foreground shadow-sm' : 'border-transparent bg-transparent hover:bg-muted'
                    )}
                    type="button"
                    onClick={() => void openCanvasProject(project.id)}
                  >
                    <span className="session-text grid min-w-0 flex-1 gap-1">
                      <strong className="truncate text-sm font-semibold">{project.title}</strong>
                      <span className="line-clamp-2 text-xs leading-4 text-muted-foreground">
                        {project.nodeCount} 个节点
                      </span>
                    </span>
                    <span className="session-loading-slot flex size-5 items-center justify-center" />
                    <span
                      className="session-delete flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      role="button"
                      tabIndex={0}
                      title="删除 Canvas 项目"
                      onClick={async (event) => {
                        event.stopPropagation()
                        if (!(await confirmDeleteCanvasProject())) return
                        void deleteCanvasProject(project.id)
                      }}
                      onKeyDown={async (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        event.stopPropagation()
                        if (!(await confirmDeleteCanvasProject())) return
                        void deleteCanvasProject(project.id)
                      }}
                    >
                      <Trash2 size={14} />
                    </span>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
          <div className="sidebar-footer shrink-0 border-t border-border p-3">
            <div className="version-line mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <strong className="text-foreground">PixAI</strong>
              <span>v{appUpdate.currentVersion}</span>
            </div>
            {hasAvailableUpdate ? (
              <button
                className="sidebar-update-banner flex w-full items-center justify-between rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-left text-sm text-primary hover:bg-primary/15"
                type="button"
                onClick={() => onOpenGlobalSettings('general')}
                title={`发现新版本 v${appUpdate.availableUpdate?.version}`}
              >
                <span className="sidebar-update-copy grid gap-1">
                  <span className="sidebar-update-label inline-flex items-center gap-1 text-xs font-medium">
                    <Download size={14} />
                    有新版本
                  </span>
                  <strong>v{appUpdate.availableUpdate?.version} 可更新</strong>
                </span>
                <ArrowRight size={14} />
              </button>
            ) : null}
          </div>
        </aside>
        <main className="main-surface min-w-0 overflow-hidden bg-background">{children}</main>
      </div>
    </div>
  )
}
