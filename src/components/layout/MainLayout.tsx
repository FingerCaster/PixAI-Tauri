import type { ReactNode } from 'react'
import { ArrowRight, BookOpen, Download, GalleryHorizontalEnd, ImagePlus, Moon, PanelRightClose, PanelRightOpen, Plus, Settings, Sun, Trash2 } from 'lucide-react'
import appLogo from '../../assets/app-logo.png'
import { IMAGE_QUALITY_LABELS, buildImageEndpoint } from '../../shared/image-options'
import { useAppStore } from '../../store/app-store'
import type { GlobalSettingsTab } from '../settings/global/GlobalSettingsModal'

export function MainLayout({
  children,
  onOpenGlobalSettings
}: {
  children: ReactNode
  onOpenGlobalSettings: (tab?: GlobalSettingsTab) => void
}) {
  const {
    conversations,
    activeConversationId,
    createConversation,
    darkMode,
    deleteConversation,
    setActiveConversation,
    setView,
    settingsVisible,
    settings,
    toggleSettings,
    toggleTheme,
    view,
    generatingByConversation,
    appUpdate
  } = useAppStore()
  const imageProfile = settings?.profiles.find((profile) => profile.id === settings.selectedImageProfileId)
  const endpoint = imageProfile ? buildImageEndpoint(imageProfile.baseUrl) : ''
  const hasAvailableUpdate = appUpdate.status === 'available' && Boolean(appUpdate.availableUpdate)

  return (
    <div className="shell app-frame">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src={appLogo} alt="" />
          <div>
            <strong>PixAI</strong>
          </div>
        </div>
        <div className="endpoint">
          <span className={imageProfile?.apiKeyStored ? 'dot good' : 'dot warn'} />
          <span>{imageProfile?.apiKeyStored ? '接口已配置' : '等待配置密钥'}</span>
          <code>{endpoint}</code>
        </div>
        <nav className="top-actions">
          <button type="button" onClick={toggleSettings} title={settingsVisible ? '隐藏参数栏' : '显示参数栏'}>
            {settingsVisible ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            参数栏
          </button>
          <button className={view === 'workspace' ? 'active-soft' : ''} type="button" onClick={() => setView('workspace')}>
            <ImagePlus size={16} />
            工作台
          </button>
          <button className={view === 'gallery' ? 'active-soft' : ''} type="button" onClick={() => setView('gallery')}>
            <GalleryHorizontalEnd size={16} />
            图库
          </button>
          <button className={view === 'prompts' ? 'active-soft' : ''} type="button" onClick={() => setView('prompts')}>
            <BookOpen size={16} />
            提示词库
          </button>
          <button className="primary-button" type="button" onClick={() => void createConversation()}>
            <Plus size={16} />
            新建会话
          </button>
        </nav>
      </header>
      <div className={`main-grid ${settingsVisible && view === 'workspace' ? '' : 'settings-hidden'}`}>
        <aside className="sidebar">
        <div className="section-title">会话</div>
        <div className="session-list">
          {conversations.map((conversation) => {
            const generating = Boolean(generatingByConversation[conversation.id])
            return (
              <button
                key={conversation.id}
                className={`${conversation.id === activeConversationId ? 'session active' : 'session'}${generating ? ' generating' : ''}`}
                type="button"
                onClick={() => void setActiveConversation(conversation.id)}
              >
                <span className="session-text">
                  <strong>{conversation.title}</strong>
                  <span>{conversation.draftPrompt || `${conversation.ratio} · ${IMAGE_QUALITY_LABELS[conversation.quality]}`}</span>
                </span>
                <span className="session-loading-slot">
                  {generating ? <span className="session-loading-indicator" aria-label="生成中" /> : null}
                </span>
                {conversations.length > 1 ? (
                  <span
                    className="session-delete"
                    role="button"
                    tabIndex={0}
                    title="删除会话"
                    onClick={(event) => {
                      event.stopPropagation()
                      void deleteConversation(conversation.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      event.stopPropagation()
                      void deleteConversation(conversation.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <div className="sidebar-footer">
          <div className="version-line">
            <strong>PixAI</strong>
            <span>v{appUpdate.currentVersion}</span>
          </div>
          {hasAvailableUpdate ? (
            <button
              className="sidebar-update-banner"
              type="button"
              onClick={() => onOpenGlobalSettings('general')}
              title={`发现新版本 v${appUpdate.availableUpdate?.version}`}
            >
              <span className="sidebar-update-copy">
                <span className="sidebar-update-label">
                  <Download size={14} />
                  有新版本
                </span>
                <strong>v{appUpdate.availableUpdate?.version} 可更新</strong>
              </span>
              <ArrowRight size={14} />
            </button>
          ) : null}
          <div className="icon-row">
            <button className="theme-toggle" type="button" onClick={toggleTheme} title="切换主题">
              <span>{darkMode ? '深色模式' : '白天模式'}</span>
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="icon-button" type="button" onClick={() => onOpenGlobalSettings('general')} title="全局设置">
              <Settings size={16} />
            </button>
          </div>
        </div>
      </aside>
      {children}
      </div>
    </div>
  )
}
