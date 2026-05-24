import { FolderOpen, PackageCheck } from 'lucide-react'
import { pixaiApi } from '../../../services/app-api'
import { useAppStore } from '../../../store/app-store'

export function ExtensionsSettingsTab() {
  const {
    codexSkillStatus,
    codexSkillInstalling,
    installCodexSkill,
    notify
  } = useAppStore()

  const openCodexSkillDirectory = async () => {
    if (!codexSkillStatus?.path) return
    try {
      await pixaiApi.shell.openPath(codexSkillStatus.path)
    } catch (error) {
      notify(error instanceof Error ? `打开目录失败：${error.message}` : '打开目录失败')
    }
  }

  return (
    <section className="settings-status-card">
      <div className="section-title">
        <h2>Codex 技能安装</h2>
        <span className={`pill tiny ${codexSkillStatus?.installed ? 'good' : 'warn'}`}>
          {codexSkillStatus?.installed ? '已安装' : '未安装'}
        </span>
      </div>
      <div className="skill-install-card">
        <div className="skill-install-copy">
          <strong>PixAI 生图工作台技能</strong>
          <span>{codexSkillStatus?.path || '全局 Codex 技能目录'}</span>
        </div>
        <div className="button-row skill-actions">
          <button className="primary-button" type="button" onClick={() => void installCodexSkill()} disabled={codexSkillInstalling}>
            <PackageCheck size={15} />
            {codexSkillInstalling ? '安装中' : codexSkillStatus?.installed ? '重新安装到全局' : '一键安装到全局'}
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => void openCodexSkillDirectory()}
            title="打开技能目录"
            disabled={!codexSkillStatus?.installed || codexSkillStatus.path === 'browser-memory'}
          >
            <FolderOpen size={15} />
          </button>
        </div>
      </div>
    </section>
  )
}
