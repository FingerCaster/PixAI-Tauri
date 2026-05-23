import type { ChangeEvent, DragEvent } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Image, Loader2, Maximize2, Sparkles, WandSparkles, X } from 'lucide-react'
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
  const [promptExpanded, setPromptExpanded] = useState(false)

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
          className="prompt-textarea"
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
          <button className="prompt-expand-button" type="button" onClick={() => setPromptExpanded(true)} title="放大查看提示词" aria-label="放大查看提示词">
            <Maximize2 size={16} />
          </button>
          <button className="generate-button" type="button" onClick={() => void generate()} disabled={!conversation.draftPrompt.trim()}>
            {generating ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
            {generating ? '继续生成' : '生成图片'}
          </button>
        </div>
      </div>
      {promptExpanded ? (
        <PromptExpandModal
          conversation={conversation}
          generating={generating}
          onClose={() => setPromptExpanded(false)}
          onGenerate={() => void generate()}
          onPromptChange={(draftPrompt) => void updateActiveConversation({ draftPrompt })}
        />
      ) : null}
    </section>
  )
}

function PromptExpandModal({
  conversation,
  generating,
  onClose,
  onGenerate,
  onPromptChange
}: {
  conversation: Conversation
  generating: boolean
  onClose: () => void
  onGenerate: () => void
  onPromptChange: (draftPrompt: string) => void
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return createPortal(
    <div
      className="modal-backdrop prompt-expand-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="prompt-expand-panel"
        role="dialog"
        aria-modal="true"
        aria-label="提示词放大编辑"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="prompt-expand-head">
          <div>
            <strong>提示词</strong>
            <span>
              {conversation.ratio} · {conversation.size} · {IMAGE_QUALITY_LABELS[conversation.quality]}
            </span>
          </div>
          <button className="icon-button prompt-expand-close" type="button" title="关闭" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <textarea
          className="prompt-expand-textarea"
          value={conversation.draftPrompt}
          placeholder="描述你想生成的画面..."
          autoFocus
          onChange={(event) => onPromptChange(event.target.value)}
        />
        <div className="prompt-expand-actions">
          <span>{conversation.draftPrompt.trim().length} 字符</span>
          <button
            className="generate-button"
            type="button"
            onClick={() => {
              onClose()
              onGenerate()
            }}
            disabled={!conversation.draftPrompt.trim()}
          >
            {generating ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
            {generating ? '继续生成' : '生成图片'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
