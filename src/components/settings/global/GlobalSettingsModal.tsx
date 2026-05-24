import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../../store/app-store'
import { ExtensionsSettingsTab } from './ExtensionsSettingsTab'
import { GeneralSettingsTab } from './GeneralSettingsTab'
import { NotificationSettingsTab } from './NotificationSettingsTab'
import { ServicesSettingsTab } from './ServicesSettingsTab'

export type GlobalSettingsTab = 'general' | 'notifications' | 'services' | 'extensions'

const TAB_OPTIONS: Array<{ id: GlobalSettingsTab; label: string }> = [
  { id: 'general', label: '常规' },
  { id: 'notifications', label: '通知' },
  { id: 'services', label: '服务' },
  { id: 'extensions', label: '扩展' }
]

export function GlobalSettingsModal({
  open,
  initialTab = 'general',
  onClose
}: {
  open: boolean
  initialTab?: GlobalSettingsTab
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<GlobalSettingsTab>(initialTab)
  const loadCodexSkillStatus = useAppStore((state) => state.loadCodexSkillStatus)

  useEffect(() => {
    if (!open) return
    setActiveTab(initialTab)
  }, [initialTab, open])

  useEffect(() => {
    if (!open) return
    void loadCodexSkillStatus()
  }, [loadCodexSkillStatus, open])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="modal-backdrop global-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="global-settings-modal" role="dialog" aria-modal="true" aria-label="全局设置" onMouseDown={(event) => event.stopPropagation()}>
        <nav className="global-settings-nav" aria-label="全局设置导航">
          <div className="global-settings-nav-title">
            <strong>全局设置</strong>
            <span>低频配置与环境状态集中放在这里。</span>
          </div>
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="global-settings-body">
          <div className="modal-head global-settings-head">
            <div>
              <h2>{getTabTitle(activeTab)}</h2>
              <span>{getTabSummary(activeTab)}</span>
            </div>
            <button className="icon-button global-settings-close" type="button" onClick={onClose} title="关闭">
              <X size={18} />
            </button>
          </div>
          <div className="global-settings-content">
            {activeTab === 'general' ? <GeneralSettingsTab /> : null}
            {activeTab === 'notifications' ? <NotificationSettingsTab /> : null}
            {activeTab === 'services' ? <ServicesSettingsTab /> : null}
            {activeTab === 'extensions' ? <ExtensionsSettingsTab /> : null}
          </div>
        </div>
      </section>
    </div>
  )
}

function getTabTitle(tab: GlobalSettingsTab): string {
  if (tab === 'notifications') return '通知'
  if (tab === 'services') return '服务'
  if (tab === 'extensions') return '扩展'
  return '常规'
}

function getTabSummary(tab: GlobalSettingsTab): string {
  if (tab === 'notifications') return '通知开关、权限状态和系统提示都在这里处理。'
  if (tab === 'services') return 'Provider 维护、默认选择和模型默认值集中管理。'
  if (tab === 'extensions') return 'Codex 技能安装与目录操作不再挤在工作区参数栏。'
  return '窗口行为和应用更新属于应用级配置，与当前会话分层。'
}
