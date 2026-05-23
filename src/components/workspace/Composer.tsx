import type { ChangeEvent, DragEvent } from 'react'
import { useEffect, useState } from 'react'
import { Image, Loader2, Sparkles, WandSparkles, X } from 'lucide-react'
import { imageSourceForDisplay } from '../../lib/platform'
import { IMAGE_QUALITY_LABELS } from '../../shared/image-options'
import type { Conversation } from '../../shared/types'
import { useAppStore } from '../../store/app-store'

export function Composer({ conversation, generating }: { conversation: Conversation; generating: boolean }) {
  const {
    enrichPrompt,
    generate,
    importReferenceFiles,
    inspirePrompt,
    promptAssistantRunning,
    removeReferenceImage,
    updateActiveConversation
  } = useAppStore()
  const [referenceSources, setReferenceSources] = useState<Record<string, string>>({})

  useEffect(() => {
    let canceled = false
    void Promise.all(
      conversation.referenceImages.map(async (reference) => [
        reference.id,
        await imageSourceForDisplay(reference.dataUrl, reference.storagePath)
      ] as const)
    ).then((entries) => {
      if (canceled) return
      setReferenceSources(Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry[1]))))
    })
    return () => {
      canceled = true
    }
  }, [conversation.referenceImages])

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return
    void importReferenceFiles(Array.from(files))
  }

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    onFiles(event.dataTransfer.files)
  }

  return (
    <section className="composer">
      <div className="composer-head">
        <div>
          <div className="composer-tools">
            <span className="pill good">{conversation.referenceImages.length > 0 ? '图生图' : '文生图'}</span>
            <span className="pill blue">{conversation.size}</span>
            <span className="pill">已保存</span>
          </div>
        </div>
        <div className="composer-actions">
          <button type="button" onClick={() => void inspirePrompt()} disabled={promptAssistantRunning.inspire}>
            {promptAssistantRunning.inspire ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            灵感
          </button>
          <button type="button" onClick={() => void enrichPrompt()} disabled={!conversation.draftPrompt.trim() || promptAssistantRunning.enrich}>
            {promptAssistantRunning.enrich ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
            丰富
          </button>
        </div>
      </div>
      {conversation.referenceImages.length > 0 ? (
        <div className="reference-row">
          {conversation.referenceImages.map((reference) => (
            <div className="reference-thumb" key={reference.id}>
              <img src={referenceSources[reference.id] || reference.dataUrl} alt={reference.name} />
              <button type="button" onClick={() => void removeReferenceImage(reference.id)} title="移除参考图">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="prompt-box">
        <textarea
          value={conversation.draftPrompt}
          placeholder="描述你想生成的画面..."
          onChange={(event) => void updateActiveConversation({ draftPrompt: event.target.value })}
        />
        <div className="prompt-foot">
          <label className="reference-footer-button" onDragOver={(event) => event.preventDefault()} onDrop={onDrop} title="添加参考图">
            <Image size={17} />
            {conversation.referenceImages.length > 0 ? <span>{conversation.referenceImages.length}</span> : null}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event: ChangeEvent<HTMLInputElement>) => onFiles(event.target.files)}
            />
          </label>
          <div className="hint">
            {conversation.ratio} · {conversation.size} · {IMAGE_QUALITY_LABELS[conversation.quality]}
          </div>
          <button className="generate-button" type="button" onClick={() => void generate()} disabled={!conversation.draftPrompt.trim()}>
            {generating ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
            {generating ? '继续生成' : '生成图片'}
          </button>
        </div>
      </div>
    </section>
  )
}
