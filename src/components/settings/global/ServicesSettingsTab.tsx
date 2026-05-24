import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Save } from 'lucide-react'
import { DEFAULT_MODEL, DEFAULT_PROMPT_MODEL } from '../../../shared/image-options'
import type { ProviderProfile } from '../../../shared/types'
import { useAppStore } from '../../../store/app-store'
import { ProviderProfileDialog, createProviderProfileDraft } from '../providers/ProviderProfileDialog'

export function ServicesSettingsTab() {
  const {
    activeConversationId,
    conversations,
    settings,
    updateActiveConversation,
    updateSettings,
    upsertProfile,
    deleteProfile
  } = useAppStore()
  const conversation = conversations.find((item) => item.id === activeConversationId) || null
  const profiles = useMemo(() => settings?.profiles || [], [settings])
  const imageProfiles = useMemo(() => profiles.filter((profile) => profile.enabledUsages.includes('image')), [profiles])
  const promptProfiles = useMemo(() => profiles.filter((profile) => profile.enabledUsages.includes('prompt')), [profiles])
  const [selectedImageProfileId, setSelectedImageProfileId] = useState(settings?.selectedImageProfileId || '')
  const [selectedPromptProfileId, setSelectedPromptProfileId] = useState(settings?.selectedPromptProfileId || '')
  const [imageModel, setImageModel] = useState(DEFAULT_MODEL)
  const [promptModel, setPromptModel] = useState(DEFAULT_PROMPT_MODEL)
  const [profileDraft, setProfileDraft] = useState<ProviderProfile | null>(null)
  const [profileDraftMode, setProfileDraftMode] = useState<'create' | 'edit'>('create')
  const [profileApiKey, setProfileApiKey] = useState('')

  useEffect(() => {
    if (!settings) return
    const imageProfile = profiles.find((profile) => profile.id === settings.selectedImageProfileId) || imageProfiles[0]
    const promptProfile = profiles.find((profile) => profile.id === settings.selectedPromptProfileId) || promptProfiles[0]
    setSelectedImageProfileId(imageProfile?.id || '')
    setSelectedPromptProfileId(promptProfile?.id || '')
    setImageModel(imageProfile?.defaultImageModel || DEFAULT_MODEL)
    setPromptModel(promptProfile?.defaultPromptModel || DEFAULT_PROMPT_MODEL)
  }, [imageProfiles, profiles, promptProfiles, settings])

  if (!settings || !conversation) return null

  const imageSelectedProfile = profiles.find((profile) => profile.id === selectedImageProfileId) || imageProfiles[0] || null
  const promptSelectedProfile = profiles.find((profile) => profile.id === selectedPromptProfileId) || promptProfiles[0] || null

  const openNewProfileDialog = () => {
    setProfileApiKey('')
    setProfileDraftMode('create')
    setProfileDraft(createProviderProfileDraft())
  }

  const openEditProfileDialog = (profile: ProviderProfile) => {
    setProfileApiKey('')
    setProfileDraftMode('edit')
    setProfileDraft({ ...profile })
  }

  const closeProfileDialog = () => {
    setProfileDraft(null)
    setProfileApiKey('')
  }

  const saveProfileDraft = async () => {
    if (!profileDraft) return
    await upsertProfile({
      ...profileDraft,
      id: profileDraftMode === 'create' ? undefined : profileDraft.id,
      apiKey: profileApiKey.trim() || undefined
    })
    closeProfileDialog()
  }

  const deleteProfileDraft = async () => {
    if (!profileDraft || profileDraftMode !== 'edit') return
    if (!window.confirm('删除此服务配置？')) return
    await deleteProfile(profileDraft.id)
    closeProfileDialog()
  }

  const saveServiceDefaults = async () => {
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

  const setAsImageDefault = async (profile: ProviderProfile) => {
    setSelectedImageProfileId(profile.id)
    setImageModel(profile.defaultImageModel || DEFAULT_MODEL)
    await updateSettings({ selectedImageProfileId: profile.id })
    await updateActiveConversation({ model: profile.defaultImageModel || DEFAULT_MODEL })
  }

  const setAsPromptDefault = async (profile: ProviderProfile) => {
    setSelectedPromptProfileId(profile.id)
    setPromptModel(profile.defaultPromptModel || DEFAULT_PROMPT_MODEL)
    await updateSettings({ selectedPromptProfileId: profile.id })
  }

  return (
    <>
      <section className="settings-status-card settings-status-card-highlight">
        <div className="section-title">
          <h2>默认服务摘要</h2>
          <button type="button" onClick={openNewProfileDialog}>
            <Plus size={15} />
            新增 Provider
          </button>
        </div>
        <div className="provider-default-grid">
          <label>
            图片默认 Provider
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
            提示词默认 Provider
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
            图片默认模型
            <input value={imageModel} onChange={(event) => setImageModel(event.target.value)} />
          </label>
          <label>
            提示词默认模型
            <input value={promptModel} onChange={(event) => setPromptModel(event.target.value)} />
          </label>
        </div>
        <div className="button-row provider-summary-actions">
          <button className="primary-button" type="button" onClick={() => void saveServiceDefaults()}>
            <Save size={15} />
            保存默认设置
          </button>
        </div>
      </section>

      <div className="provider-summary-list">
        {profiles.map((profile) => {
          const isImageDefault = settings.selectedImageProfileId === profile.id
          const isPromptDefault = settings.selectedPromptProfileId === profile.id
          return (
            <section key={profile.id} className="settings-status-card provider-summary-card">
              <div className="provider-summary-head">
                <div className="provider-summary-copy">
                  <div className="provider-summary-title-row">
                    <strong>{profile.name}</strong>
                    <div className="provider-badges">
                      {isImageDefault ? <span className="pill tiny good">图片默认</span> : null}
                      {isPromptDefault ? <span className="pill tiny blue">提示词默认</span> : null}
                    </div>
                  </div>
                  <span>{profile.baseUrl}</span>
                  <span>
                    {profile.enabledUsages.includes('image') ? `图片模型 ${profile.defaultImageModel}` : '不提供生图'}
                    {' · '}
                    {profile.enabledUsages.includes('prompt') ? `提示词模型 ${profile.defaultPromptModel}` : '不提供提示词'}
                  </span>
                </div>
                <button className="icon-button" type="button" onClick={() => openEditProfileDialog(profile)} title="编辑 Provider">
                  <Pencil size={15} />
                </button>
              </div>
              <div className="button-row provider-summary-actions">
                <button
                  type="button"
                  disabled={!profile.enabledUsages.includes('image') || isImageDefault}
                  onClick={() => void setAsImageDefault(profile)}
                >
                  设为图片默认
                </button>
                <button
                  type="button"
                  disabled={!profile.enabledUsages.includes('prompt') || isPromptDefault}
                  onClick={() => void setAsPromptDefault(profile)}
                >
                  设为提示词默认
                </button>
              </div>
            </section>
          )
        })}
      </div>

      <ProviderProfileDialog
        mode={profileDraftMode}
        profileDraft={profileDraft}
        profileApiKey={profileApiKey}
        profileCount={settings.profiles.length}
        onClose={closeProfileDialog}
        onSave={() => void saveProfileDraft()}
        onDelete={() => void deleteProfileDraft()}
        onProfileChange={setProfileDraft}
        onApiKeyChange={setProfileApiKey}
      />
    </>
  )
}
