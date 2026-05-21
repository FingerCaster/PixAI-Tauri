import { useEffect, useMemo, useState } from 'react'
import { CircleHelp, Plus, Save, X } from 'lucide-react'
import {
  DEFAULT_IMAGE_OUTPUT_FORMAT,
  DEFAULT_MODEL,
  DEFAULT_PROMPT_MODEL,
  IMAGE_BACKGROUNDS,
  IMAGE_BACKGROUND_LABELS,
  IMAGE_INPUT_FIDELITIES,
  IMAGE_INPUT_FIDELITY_LABELS,
  IMAGE_MODERATIONS,
  IMAGE_MODERATION_LABELS,
  IMAGE_OUTPUT_FORMATS,
  IMAGE_OUTPUT_FORMAT_LABELS,
  IMAGE_QUALITIES,
  IMAGE_RATIOS,
  MAX_IMAGE_MAX_RETRIES,
  formatImageQuality,
  getDefaultImageSize,
  getImageSizeOptions,
  supportsImageInputFidelity
} from '../../shared/image-options'
import type { ImageBackground, ImageInputFidelity, ImageModeration, ImageOutputFormat, ProviderProfile } from '../../shared/types'
import { useAppStore } from '../../store/app-store'
import { GallerySelect } from '../common/GallerySelect'

export function SettingsPanel() {
  const {
    activeConversationId,
    conversations,
    settings,
    updateActiveConversation,
    updateSettings,
    upsertProfile
  } = useAppStore()
  const conversation = conversations.find((item) => item.id === activeConversationId) || null
  const profiles = useMemo(() => settings?.profiles || [], [settings])
  const imageProfiles = useMemo(() => profiles.filter((profile) => profile.enabledUsages.includes('image')), [profiles])
  const promptProfiles = useMemo(() => profiles.filter((profile) => profile.enabledUsages.includes('prompt')), [profiles])
  const [selectedImageProfileId, setSelectedImageProfileId] = useState(settings?.selectedImageProfileId || '')
  const [selectedPromptProfileId, setSelectedPromptProfileId] = useState(settings?.selectedPromptProfileId || '')
  const [imageModel, setImageModel] = useState(DEFAULT_MODEL)
  const [promptModel, setPromptModel] = useState(DEFAULT_PROMPT_MODEL)
  const [newProfileDraft, setNewProfileDraft] = useState<ProviderProfile | null>(null)
  const [newApiKey, setNewApiKey] = useState('')

  useEffect(() => {
    if (!settings) return
    const imageProfile = profiles.find((profile) => profile.id === settings.selectedImageProfileId) || imageProfiles[0]
    const promptProfile = profiles.find((profile) => profile.id === settings.selectedPromptProfileId) || promptProfiles[0]
    setSelectedImageProfileId(imageProfile?.id || '')
    setSelectedPromptProfileId(promptProfile?.id || '')
    setImageModel(imageProfile?.defaultImageModel || DEFAULT_MODEL)
    setPromptModel(promptProfile?.defaultPromptModel || DEFAULT_PROMPT_MODEL)
  }, [imageProfiles, profiles, promptProfiles, settings])

  if (!settings || !conversation) return <aside className="settings-panel" />

  const openNewProfileDialog = () => {
    setNewApiKey('')
    setNewProfileDraft(createProfileDraft())
  }
  const imageSelectedProfile = profiles.find((profile) => profile.id === selectedImageProfileId) || imageProfiles[0] || null
  const promptSelectedProfile = profiles.find((profile) => profile.id === selectedPromptProfileId) || promptProfiles[0] || null
  const isImageToImage = conversation.referenceImages.length > 0
  const sizeOptions = getImageSizeOptions(conversation.ratio)
  const selectedSize = sizeOptions.some((option) => option.value === conversation.size)
    ? conversation.size
    : getDefaultImageSize(conversation.ratio)
  const saveProviderConfig = async () => {
    const imageProfile = imageSelectedProfile
    const promptProfile = promptSelectedProfile
    if (imageProfile && promptProfile && imageProfile.id === promptProfile.id) {
      await upsertProfile({
        ...imageProfile,
        defaultImageModel: imageModel.trim() || DEFAULT_MODEL,
        defaultPromptModel: promptModel.trim() || DEFAULT_PROMPT_MODEL
      })
    } else {
      if (imageProfile) await upsertProfile({ ...imageProfile, defaultImageModel: imageModel.trim() || DEFAULT_MODEL })
      if (promptProfile) await upsertProfile({ ...promptProfile, defaultPromptModel: promptModel.trim() || DEFAULT_PROMPT_MODEL })
    }
    await updateSettings({
      selectedImageProfileId: imageProfile?.id,
      selectedPromptProfileId: promptProfile?.id
    })
    await updateActiveConversation({ model: imageModel.trim() || DEFAULT_MODEL })
  }

  return (
    <aside className="settings-panel">
      <section className="settings-section">
        <div className="section-title">
          <h2>服务配置</h2>
          <button className="icon-button" type="button" onClick={openNewProfileDialog} title="新增供应商">
            <Plus size={15} />
          </button>
        </div>
        <label>
          图片生成
          <select
            value={selectedImageProfileId}
            onChange={(event) => {
              const profile = profiles.find((item) => item.id === event.target.value)
              setSelectedImageProfileId(event.target.value)
              setImageModel(profile?.defaultImageModel || DEFAULT_MODEL)
            }}
          >
            {imageProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          提示词助手
          <select
            value={selectedPromptProfileId}
            onChange={(event) => {
              const profile = profiles.find((item) => item.id === event.target.value)
              setSelectedPromptProfileId(event.target.value)
              setPromptModel(profile?.defaultPromptModel || DEFAULT_PROMPT_MODEL)
            }}
          >
            {promptProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          图片模型
          <input value={imageModel} onChange={(event) => setImageModel(event.target.value)} />
        </label>
        <label>
          提示词模型
          <input value={promptModel} onChange={(event) => setPromptModel(event.target.value)} />
        </label>
        <button className="primary-button full" type="button" onClick={() => void saveProviderConfig()}>
          <Save size={15} />
          保存服务配置
        </button>
      </section>

      <section className="settings-section">
        <div className="section-title">
          <h2>当前会话参数</h2>
        </div>
        <div className="field">
          <span>图片比例</span>
          <div className="segmented">
            {IMAGE_RATIOS.map((ratio) => (
              <button
                key={ratio}
                className={conversation.ratio === ratio ? 'on' : ''}
                type="button"
                onClick={() => void updateActiveConversation({ ratio, size: getDefaultImageSize(ratio) })}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>分辨率</span>
          <GallerySelect
            value={selectedSize}
            options={sizeOptions}
            ariaLabel="选择分辨率"
            className="settings-select"
            onChange={(size) => void updateActiveConversation({ size })}
          />
        </div>
        <div className="field">
          <span className="field-label-with-help">
            <span>质量</span>
            <button
              type="button"
              className="info-icon"
              title="质量越高，细节通常更多，但生成会更慢，也更容易放大成本。"
              aria-label="质量说明"
            >
              <CircleHelp size={14} />
            </button>
          </span>
          <div className="segmented">
            {IMAGE_QUALITIES.map((quality) => (
              <button
                key={quality}
                className={conversation.quality === quality ? 'on' : ''}
                type="button"
                onClick={() => void updateActiveConversation({ quality })}
              >
                {formatImageQuality(quality)}
              </button>
            ))}
          </div>
        </div>
        <label>
          生成数量
          <input type="number" min={1} max={10} value={conversation.n} onChange={(event) => void updateActiveConversation({ n: Number(event.target.value) })} />
        </label>
        <label>
          失败重试次数
          <input
            type="number"
            min={0}
            max={MAX_IMAGE_MAX_RETRIES}
            step={1}
            value={conversation.maxRetries}
            onChange={(event) => void updateActiveConversation({ maxRetries: Number(event.target.value) })}
          />
        </label>
        <details className="advanced-settings">
          <summary>
            <span>高级设置</span>
            <span className={`pill tiny ${isImageToImage ? 'blue' : ''}`}>{isImageToImage ? '图生图' : '文生图'}</span>
          </summary>
          <div className="advanced-settings-body">
            <ToggleRow
              label="流式输出"
              help="开启后会以流式方式接收图片结果；默认关闭。"
              checked={conversation.stream}
              onChange={() => void updateActiveConversation({ stream: !conversation.stream })}
            />
            <label>
              <span className="field-label-with-help">
                <span>超时时间(秒)</span>
                <button
                  type="button"
                  className="info-icon"
                  title="单张图片的最大等待时间；每次重试都会重新计时。"
                  aria-label="超时时间说明"
                >
                  <CircleHelp size={14} />
                </button>
              </span>
              <input
                type="number"
                min={1}
                max={1800}
                step={1}
                value={conversation.generationTimeoutSeconds}
                onChange={(event) => void updateActiveConversation({ generationTimeoutSeconds: Number(event.target.value) })}
              />
            </label>
            <div className="field">
              <span className="field-label-with-help">
                <span>输出格式</span>
                <button
                  type="button"
                  className="info-icon"
                  title={`控制最终图片文件格式，默认使用 ${DEFAULT_IMAGE_OUTPUT_FORMAT.toUpperCase()}。`}
                  aria-label="输出格式说明"
                >
                  <CircleHelp size={14} />
                </button>
              </span>
              <GallerySelect
                value={conversation.outputFormat}
                options={IMAGE_OUTPUT_FORMATS.map((value) => ({ value, label: IMAGE_OUTPUT_FORMAT_LABELS[value] }))}
                ariaLabel="输出格式"
                className="settings-select"
                onChange={(outputFormat) => void updateActiveConversation({ outputFormat: outputFormat as ImageOutputFormat })}
              />
            </div>
            <label>
              <span className="field-label-with-help">
                <span>输出压缩</span>
                <button
                  type="button"
                  className="info-icon"
                  title="仅 JPEG 和 WebP 有效，数值越高画质越好、文件越大。"
                  aria-label="输出压缩说明"
                >
                  <CircleHelp size={14} />
                </button>
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={conversation.outputCompression ?? ''}
                disabled={conversation.outputFormat === 'png'}
                placeholder="留空"
                onChange={(event) => {
                  const value = event.target.value.trim()
                  void updateActiveConversation({ outputCompression: value ? Number(value) : null })
                }}
              />
            </label>
            <div className="field">
              <span className="field-label-with-help">
                <span>背景</span>
                <button
                  type="button"
                  className="info-icon"
                  title="选择是否保持自动背景或强制不透明背景。"
                  aria-label="背景说明"
                >
                  <CircleHelp size={14} />
                </button>
              </span>
              <GallerySelect
                value={conversation.background}
                options={IMAGE_BACKGROUNDS.map((value) => ({ value, label: IMAGE_BACKGROUND_LABELS[value] }))}
                ariaLabel="背景"
                className="settings-select"
                onChange={(background) => void updateActiveConversation({ background: background as ImageBackground })}
              />
            </div>
            <div className="field">
              <span className="field-label-with-help">
                <span>审核策略</span>
                <button
                  type="button"
                  className="info-icon"
                  title="控制内容审核强度，默认使用自动策略。"
                  aria-label="审核策略说明"
                >
                  <CircleHelp size={14} />
                </button>
              </span>
              <GallerySelect
                value={conversation.moderation}
                options={IMAGE_MODERATIONS.map((value) => ({ value, label: IMAGE_MODERATION_LABELS[value] }))}
                ariaLabel="审核策略"
                className="settings-select"
                onChange={(moderation) => void updateActiveConversation({ moderation: moderation as ImageModeration })}
              />
            </div>
            <label>
              <span className="field-label-with-help">
                <span>中间图数量</span>
                <button
                  type="button"
                  className="info-icon"
                  title="仅流式输出时有效，范围为 0 到 3。"
                  aria-label="中间图数量说明"
                >
                  <CircleHelp size={14} />
                </button>
              </span>
              <input
                type="number"
                min={0}
                max={3}
                step={1}
                value={conversation.partialImages ?? 0}
                disabled={!conversation.stream}
                onChange={(event) => void updateActiveConversation({ partialImages: Number(event.target.value) })}
              />
            </label>
            {isImageToImage && supportsImageInputFidelity(conversation.model) ? (
              <div className="field">
                <span className="field-label-with-help">
                  <span>输入保真度</span>
                  <button
                    type="button"
                    className="info-icon"
                    title="编辑场景下控制对输入参考图细节的保留程度。"
                    aria-label="输入保真度说明"
                  >
                    <CircleHelp size={14} />
                  </button>
                </span>
                <GallerySelect
                  value={conversation.inputFidelity || ''}
                  options={[
                    { value: '', label: '保持默认' },
                    ...IMAGE_INPUT_FIDELITIES.map((value) => ({ value, label: IMAGE_INPUT_FIDELITY_LABELS[value] }))
                  ]}
                  ariaLabel="输入保真度"
                  className="settings-select"
                  onChange={(inputFidelity) =>
                    void updateActiveConversation({
                      inputFidelity: inputFidelity === '' ? null : inputFidelity as ImageInputFidelity
                    })
                  }
                />
              </div>
            ) : null}
          </div>
        </details>
        <div className="toggle-stack">
          <ToggleRow
            label="自动写入历史"
            checked={conversation.autoSaveHistory}
            onChange={() => void updateActiveConversation({ autoSaveHistory: !conversation.autoSaveHistory })}
          />
          <ToggleRow
            label="失败详情保留"
            checked={conversation.keepFailureDetails}
            onChange={() => void updateActiveConversation({ keepFailureDetails: !conversation.keepFailureDetails })}
          />
        </div>
      </section>
      {newProfileDraft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setNewProfileDraft(null)}>
          <section className="provider-modal" role="dialog" aria-modal="true" aria-label="新增供应商" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>新增供应商</h2>
              <button className="icon-button" type="button" onClick={() => setNewProfileDraft(null)} title="关闭">
                <X size={16} />
              </button>
            </div>
            <div className="profile-editor">
              <div className="field">
                <span>用途</span>
                <div className="segmented provider-usage">
                  <button
                    className={hasSameUsages(newProfileDraft, ['image']) ? 'on' : ''}
                    type="button"
                    onClick={() => setNewProfileDraft({ ...newProfileDraft, enabledUsages: ['image'] })}
                  >
                    生图
                  </button>
                  <button
                    className={hasSameUsages(newProfileDraft, ['prompt']) ? 'on' : ''}
                    type="button"
                    onClick={() => setNewProfileDraft({ ...newProfileDraft, enabledUsages: ['prompt'] })}
                  >
                    提示词
                  </button>
                  <button
                    className={hasSameUsages(newProfileDraft, ['image', 'prompt']) ? 'on' : ''}
                    type="button"
                    onClick={() => setNewProfileDraft({ ...newProfileDraft, enabledUsages: ['image', 'prompt'] })}
                  >
                    二者都可
                  </button>
                </div>
              </div>
              <label>
                配置名称
                <input value={newProfileDraft.name} onChange={(event) => setNewProfileDraft({ ...newProfileDraft, name: event.target.value })} />
              </label>
              <label>
                接口地址
                <input value={newProfileDraft.baseUrl} onChange={(event) => setNewProfileDraft({ ...newProfileDraft, baseUrl: event.target.value })} />
              </label>
              <label>
                API 密钥
                <input value={newApiKey} type="password" placeholder="sk-..." onChange={(event) => setNewApiKey(event.target.value)} />
              </label>
              {newProfileDraft.enabledUsages.includes('image') ? (
                <label>
                  图片默认模型
                  <input value={newProfileDraft.defaultImageModel} onChange={(event) => setNewProfileDraft({ ...newProfileDraft, defaultImageModel: event.target.value })} />
                </label>
              ) : null}
              {newProfileDraft.enabledUsages.includes('prompt') ? (
                <label>
                  提示词助手模型
                  <input value={newProfileDraft.defaultPromptModel} onChange={(event) => setNewProfileDraft({ ...newProfileDraft, defaultPromptModel: event.target.value })} />
                </label>
              ) : null}
            </div>
            <div className="button-row modal-actions">
              <button type="button" onClick={() => setNewProfileDraft(null)}>
                取消
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() =>
                  void upsertProfile({ ...newProfileDraft, id: undefined, apiKey: newApiKey || undefined }).then(() => {
                    setNewProfileDraft(null)
                    setNewApiKey('')
                  })
                }
              >
                <Plus size={15} />
                添加供应商
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  )
}

function createProfileDraft(): ProviderProfile {
  const now = new Date().toISOString()
  return {
    id: '',
    name: 'OpenAI 兼容接口',
    type: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:37123',
    defaultImageModel: DEFAULT_MODEL,
    defaultPromptModel: DEFAULT_PROMPT_MODEL,
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

function ToggleRow({
  label,
  help,
  checked,
  onChange
}: {
  label: string
  help?: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button className="toggle-row" type="button" onClick={onChange}>
      <span className="field-label-with-help">
        <span>{label}</span>
        {help ? (
          <span className="info-icon" title={help} aria-label={`${label}说明`}>
            <CircleHelp size={14} />
          </span>
        ) : null}
      </span>
      <span className={`switch ${checked ? '' : 'off'}`} />
    </button>
  )
}
