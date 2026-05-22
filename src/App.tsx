import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { GalleryPage } from './components/gallery/GalleryPage'
import { MainLayout } from './components/layout/MainLayout'
import { PromptLibraryPage } from './components/prompts/PromptLibraryPage'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { Workspace } from './components/workspace/Workspace'
import { registerCodexBridgeHandler } from './services/codex-bridge'
import { isTauriRuntime } from './lib/platform'
import { useAppStore } from './store/app-store'
import './styles.css'

function App() {
  const { darkMode, load, loading, reloadHistory, settingsVisible, toast, view } = useAppStore()

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
