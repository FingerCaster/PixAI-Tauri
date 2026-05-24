import { Plus, Save, Trash2, X } from 'lucide-react'
import { GallerySelect } from '../../common/GallerySelect'
import { DEFAULT_MODEL, DEFAULT_PROMPT_MODEL } from '../../../shared/image-options'
import type { ImageGenerationEndpoint, ProviderProfile } from '../../../shared/types'

type ProviderProfileDialogProps = {
  mode: 'create' | 'edit'
  profileDraft: ProviderProfile | null
  profileApiKey: string
  profileCount: number
  onClose: () => void
  onSave: () => void
  onDelete: () => void
  onProfileChange: (profile: ProviderProfile) => void
  onApiKeyChange: (value: string) => void
}

export function ProviderProfileDialog({
  mode,
  profileDraft,
  profileApiKey,
  profileCount,
  onClose,
  onSave,
  onDelete,
  onProfileChange,
  onApiKeyChange
}: ProviderProfileDialogProps) {
  if (!profileDraft) return null

  return (
    <div className="modal-backdrop provider-profile-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="provider-modal"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'create' ? '新增供应商' : '编辑供应商'}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{mode === 'create' ? '新增供应商' : '编辑供应商'}</h2>
          <button className="icon-button modal-close-button" type="button" onClick={onClose} title="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="profile-editor">
          <div className="field">
            <span>用途</span>
            <div className="segmented provider-usage">
              <button
                className={hasSameUsages(profileDraft, ['image']) ? 'on' : ''}
                type="button"
                onClick={() => onProfileChange({ ...profileDraft, enabledUsages: ['image'] })}
              >
                生图
              </button>
              <button
                className={hasSameUsages(profileDraft, ['prompt']) ? 'on' : ''}
                type="button"
                onClick={() => onProfileChange({ ...profileDraft, enabledUsages: ['prompt'] })}
              >
                提示词
              </button>
              <button
                className={hasSameUsages(profileDraft, ['image', 'prompt']) ? 'on' : ''}
                type="button"
                onClick={() => onProfileChange({ ...profileDraft, enabledUsages: ['image', 'prompt'] })}
              >
                二者都可
              </button>
            </div>
          </div>
          <label>
            配置名称
            <input value={profileDraft.name} onChange={(event) => onProfileChange({ ...profileDraft, name: event.target.value })} />
          </label>
          <label>
            接口地址
            <input value={profileDraft.baseUrl} onChange={(event) => onProfileChange({ ...profileDraft, baseUrl: event.target.value })} />
          </label>
          <label>
            API 密钥
            <input
              value={profileApiKey}
              type="password"
              placeholder={mode === 'edit' && profileDraft.apiKeyStored ? '留空保持不变' : 'sk-...'}
              onChange={(event) => onApiKeyChange(event.target.value)}
            />
          </label>
          {profileDraft.enabledUsages.includes('image') ? (
            <>
              <label>
                图片默认模型
                <input
                  value={profileDraft.defaultImageModel}
                  onChange={(event) => onProfileChange({ ...profileDraft, defaultImageModel: event.target.value })}
                />
              </label>
              <div className="field">
                <span>生图端点</span>
                <GallerySelect
                  value={profileDraft.imageGenerationEndpoint}
                  options={[
                    { value: 'images-api', label: 'Images API' },
                    { value: 'responses-api', label: 'Responses 图像工具' }
                  ]}
                  ariaLabel="生图端点"
                  className="settings-select"
                  onChange={(imageGenerationEndpoint) =>
                    onProfileChange({ ...profileDraft, imageGenerationEndpoint: imageGenerationEndpoint as ImageGenerationEndpoint })
                  }
                />
              </div>
            </>
          ) : null}
          {profileDraft.enabledUsages.includes('prompt') ? (
            <label>
              提示词助手模型
              <input
                value={profileDraft.defaultPromptModel}
                onChange={(event) => onProfileChange({ ...profileDraft, defaultPromptModel: event.target.value })}
              />
            </label>
          ) : null}
        </div>
        <div className="button-row modal-actions">
          {mode === 'edit' && profileCount > 1 ? (
            <button className="danger-button" type="button" onClick={onDelete}>
              <Trash2 size={15} />
              删除
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="button" onClick={onSave}>
            {mode === 'create' ? <Plus size={15} /> : <Save size={15} />}
            {mode === 'create' ? '添加供应商' : '保存供应商'}
          </button>
        </div>
      </section>
    </div>
  )
}

export function createProviderProfileDraft(): ProviderProfile {
  const now = new Date().toISOString()
  return {
    id: '',
    name: 'OpenAI 兼容接口',
    type: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:37123',
    defaultImageModel: DEFAULT_MODEL,
    defaultPromptModel: DEFAULT_PROMPT_MODEL,
    imageGenerationEndpoint: 'images-api',
    enabledUsages: ['image', 'prompt'],
    capabilities: ['text-to-image', 'image-to-image', 'prompt-assist', 'connection-test', 'streaming', 'input-fidelity'],
    apiKeyStored: false,
    insecureStorage: false,
    createdAt: now,
    updatedAt: now
  }
}

function hasSameUsages(profile: ProviderProfile, usages: Array<'image' | 'prompt'>): boolean {
  return profile.enabledUsages.length === usages.length && usages.every((usage) => profile.enabledUsages.includes(usage))
}
