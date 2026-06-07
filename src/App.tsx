import { useEffect, useLayoutEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GalleryPage } from './components/gallery/GalleryPage'
import { CanvasWorkspace } from './components/canvas/CanvasWorkspace'
import { CanvasShell } from './components/layout/CanvasShell'
import { SharedLibraryShell } from './components/layout/SharedLibraryShell'
import { WorkspaceShell } from './components/layout/WorkspaceShell'
import { PromptLibraryPage } from './components/prompts/PromptLibraryPage'
import { GlobalSettingsModal, type GlobalSettingsTab } from './components/settings/global/GlobalSettingsModal'
import { Workspace } from './components/workspace/Workspace'
import { registerCodexBridgeHandler } from './services/codex-bridge'
import { isTauriRuntime, notifyWindowSentToTray, watchCloseRequested, watchWindowFocus } from './lib/platform'
import { applyDocumentTheme } from './lib/theme'
import { useAppStore } from './store/app-store'

function App() {
  const { darkMode, load, loading, reloadHistory, setView, setWindowFocused, toast, view } = useAppStore()
  const [globalSettingsState, setGlobalSettingsState] = useState<{ open: boolean; tab: GlobalSettingsTab }>({
    open: false,
    tab: 'general'
  })

  const closeToTray = useAppStore((state) => state.preferences?.closeToTray ?? true)
  const openGlobalSettings = (tab: GlobalSettingsTab = 'general') => setGlobalSettingsState({ open: true, tab })
  const closeGlobalSettings = () => setGlobalSettingsState((state) => ({ ...state, open: false }))

  useLayoutEffect(() => applyDocumentTheme(darkMode), [darkMode])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!isTauriRuntime()) return undefined
    const preventDefaultContextMenu = (event: MouseEvent) => event.preventDefault()
    window.addEventListener('contextmenu', preventDefaultContextMenu, true)
    return () => window.removeEventListener('contextmenu', preventDefaultContextMenu, true)
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) return undefined
    let disposed = false
    let unlisten: (() => void) | null = null
    void registerCodexBridgeHandler()
    void listen('pixai://codex-bridge/changed', () => {
      void load().then(() => reloadHistory())
    }).then((nextUnlisten) => {
      if (disposed) void nextUnlisten()
      else unlisten = nextUnlisten
    })
    return () => {
      disposed = true
      if (unlisten) void unlisten()
    }
  }, [load, reloadHistory])

  useEffect(() => {
    let disposed = false
    let unwatch: (() => void) | null = null
    void watchWindowFocus((focused) => {
      setWindowFocused(focused)
    }).then((nextUnwatch) => {
      if (disposed) void nextUnwatch()
      else unwatch = nextUnwatch
    })
    return () => {
      disposed = true
      if (unwatch) void unwatch()
    }
  }, [setWindowFocused])

  useEffect(() => {
    let disposed = false
    let unwatch: (() => void) | null = null
    void watchCloseRequested(() => {
      const { preferences } = useAppStore.getState()
      if (!preferences?.closeToTray) return false
      void notifyWindowSentToTray().catch(() => undefined)
      return 'hide'
    }).then((nextUnwatch) => {
      if (disposed) void nextUnwatch()
      else unwatch = nextUnwatch
    })
    return () => {
      disposed = true
      if (unwatch) void unwatch()
    }
  }, [closeToTray])

  useEffect(() => {
    const onActivated = () => {
      setView('workspace')
    }
    if (!isTauriRuntime()) {
      window.addEventListener('pixai:system-notification-activated', onActivated)
      return () => window.removeEventListener('pixai:system-notification-activated', onActivated)
    }
    let disposed = false
    let unlisten: (() => void) | null = null
    void listen('pixai://system-notification/activated', onActivated).then((nextUnwatch) => {
      if (disposed) void nextUnwatch()
      else unlisten = nextUnwatch
    })
    return () => {
      disposed = true
      if (unlisten) void unlisten()
    }
  }, [setView])

  return (
    <TooltipProvider delayDuration={250}>
      <div className="min-h-dvh bg-background text-foreground">
        {view === 'workspace' ? (
          <WorkspaceShell onOpenGlobalSettings={openGlobalSettings}>
            {loading ? <LoadingState /> : <Workspace />}
          </WorkspaceShell>
        ) : null}
        {view === 'canvas' ? (
          <CanvasShell onOpenGlobalSettings={openGlobalSettings}>
            {loading ? <LoadingState /> : <CanvasWorkspace />}
          </CanvasShell>
        ) : null}
        {view === 'gallery' ? (
          <SharedLibraryShell onOpenGlobalSettings={openGlobalSettings}>
            {loading ? <LoadingState /> : <GalleryPage />}
          </SharedLibraryShell>
        ) : null}
        {view === 'prompts' ? (
          <SharedLibraryShell onOpenGlobalSettings={openGlobalSettings}>
            {loading ? <LoadingState /> : <PromptLibraryPage />}
          </SharedLibraryShell>
        ) : null}
        <GlobalSettingsModal open={globalSettingsState.open} initialTab={globalSettingsState.tab} onClose={closeGlobalSettings} />
        {toast ? (
          <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-popover px-4 py-2 text-sm font-medium text-popover-foreground shadow-xl">
            {toast}
          </div>
        ) : null}
        <Toaster richColors closeButton theme={darkMode ? 'dark' : 'light'} />
      </div>
    </TooltipProvider>
  )
}

function LoadingState() {
  return <div className="grid h-full place-items-center text-sm text-muted-foreground">正在加载 PixAI 工作台...</div>
}

export default App
