import { useEffect } from 'react'
import { GalleryPage } from './components/gallery/GalleryPage'
import { MainLayout } from './components/layout/MainLayout'
import { PromptLibraryPage } from './components/prompts/PromptLibraryPage'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { Workspace } from './components/workspace/Workspace'
import { useAppStore } from './store/app-store'
import './styles.css'

function App() {
  const { darkMode, load, loading, settingsVisible, toast, view } = useAppStore()

  useEffect(() => {
    void load()
  }, [load])

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
