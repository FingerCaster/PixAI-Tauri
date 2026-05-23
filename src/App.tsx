import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { GalleryPage } from './components/gallery/GalleryPage'
import { MainLayout } from './components/layout/MainLayout'
import { PromptLibraryPage } from './components/prompts/PromptLibraryPage'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { Workspace } from './components/workspace/Workspace'
import { registerCodexBridgeHandler } from './services/codex-bridge'
import { isTauriRuntime, notifyWindowSentToTray, watchCloseRequested, watchWindowFocus } from './lib/platform'
import { useAppStore } from './store/app-store'
import './styles.css'

function App() {
  const { darkMode, load, loading, reloadHistory, setView, setWindowFocused, settingsVisible, toast, view } = useAppStore()

  const closeToTray = useAppStore((state) => state.preferences?.closeToTray ?? true)

  useEffect(() => {
    void load()
  }, [load])

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
    <div className={darkMode ? 'app theme-dark' : 'app'}>
      <MainLayout>
        <main className="main-surface">
          {loading ? <div className="loading">正在加载 PixAI 工作台...</div> : null}
          {!loading && view === 'workspace' ? <Workspace /> : null}
          {!loading && view === 'gallery' ? <GalleryPage /> : null}
          {!loading && view === 'prompts' ? <PromptLibraryPage /> : null}
        </main>
        {view === 'workspace' && settingsVisible ? <SettingsPanel /> : null}
      </MainLayout>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}

export default App
