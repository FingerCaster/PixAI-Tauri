import type { ChangeEvent, DragEvent } from 'react'
import { useEffect, useState } from 'react'
import { Image, Loader2, Maximize2, Sparkles, WandSparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { imageSourceForDisplay, imageSourceForDisplaySync } from '../../lib/platform'
import { IMAGE_QUALITY_LABELS } from '../../shared/image-options'
import type { Conversation, ReferenceImage } from '../../shared/types'
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
  const [previewReference, setPreviewReference] = useState<ReferenceImage | null>(null)

  useEffect(() => {
    let canceled = false
    setReferenceSources((currentSources) => ({
      ...currentSources,
      ...Object.fromEntries(
        conversation.referenceImages
          .map((reference) => [reference.id, imageSourceForDisplaySync(reference.dataUrl, reference.storagePath)] as const)
          .filter((entry): entry is [string, string] => Boolean(entry[1]))
      )
    }))
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
    <section className="composer rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="composer-head mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="composer-tools flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="pill good">{conversation.referenceImages.length > 0 ? '图生图' : '文生图'}</Badge>
            <Badge variant="outline" className="pill blue">{conversation.size}</Badge>
            <Badge variant="outline" className="pill">已保存</Badge>
          </div>
        </div>
        <div className="composer-actions flex items-center gap-2">
          <Button variant="outline" size="sm" type="button" onClick={() => void inspirePrompt()} disabled={promptAssistantRunning.inspire}>
            {promptAssistantRunning.inspire ? <Loader2 className="spin animate-spin" /> : <Sparkles />}
            灵感
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={() => void enrichPrompt()} disabled={!conversation.draftPrompt.trim() || promptAssistantRunning.enrich}>
            {promptAssistantRunning.enrich ? <Loader2 className="spin animate-spin" /> : <WandSparkles />}
            丰富
          </Button>
        </div>
      </div>
      {conversation.referenceImages.length > 0 ? (
        <div className="reference-row mb-3 flex gap-2 overflow-x-auto pb-1">
          {conversation.referenceImages.map((reference) => (
            <div className="reference-thumb group relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted" key={reference.id}>
              <button className="reference-preview-button h-full w-full" type="button" onClick={() => setPreviewReference(reference)} title="查看参考图">
                <img className="h-full w-full object-cover" src={referenceSources[reference.id] || reference.dataUrl} alt={reference.name} />
              </button>
              <button
                className="reference-remove-button absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                type="button"
                onClick={() => void removeReferenceImage(reference.id)}
                title="移除参考图"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="prompt-box rounded-xl border border-input bg-background">
        <Textarea
          className="prompt-textarea min-h-28 resize-none border-0 bg-transparent p-3 text-base shadow-none focus-visible:ring-0"
          value={conversation.draftPrompt}
          placeholder="描述你想生成的画面..."
          onChange={(event) => void updateActiveConversation({ draftPrompt: event.target.value })}
        />
        <div className="prompt-foot flex items-center gap-2 border-t border-border px-2 py-2">
          <label
            className="reference-footer-button inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            title="添加参考图"
          >
            <Image size={17} />
            {conversation.referenceImages.length > 0 ? <span>{conversation.referenceImages.length}</span> : null}
            <input
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event: ChangeEvent<HTMLInputElement>) => onFiles(event.target.files)}
            />
          </label>
          <div className="hint min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {conversation.ratio} · {conversation.size} · {IMAGE_QUALITY_LABELS[conversation.quality]}
          </div>
          <Button className="prompt-expand-button" variant="ghost" size="icon-sm" type="button" onClick={() => setPromptExpanded(true)} title="放大查看提示词" aria-label="放大查看提示词">
            <Maximize2 size={16} />
          </Button>
          <Button className="generate-button" type="button" onClick={() => void generate()} disabled={!conversation.draftPrompt.trim()}>
            {generating ? <Loader2 className="spin animate-spin" /> : <WandSparkles />}
            {generating ? '继续生成' : '生成图片'}
          </Button>
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
      {previewReference ? (
        <ReferencePreviewModal
          reference={previewReference}
          source={referenceSources[previewReference.id] || previewReference.dataUrl}
          onClose={() => setPreviewReference(null)}
        />
      ) : null}
    </section>
  )
}

function ReferencePreviewModal({ reference, source, onClose }: { reference: ReferenceImage; source: string; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="image-preview-panel max-w-5xl" aria-label="参考图预览" aria-describedby={undefined}>
        <DialogHeader className="image-preview-head">
          <DialogTitle className="truncate">{reference.name}</DialogTitle>
          <span className="text-sm text-muted-foreground">
            {reference.mimeType} · {formatFileSize(reference.fileSizeBytes)}
          </span>
        </DialogHeader>
        <div className="image-preview-stage grid max-h-[72vh] place-items-center overflow-hidden rounded-xl bg-muted">
          <img className="max-h-[72vh] max-w-full object-contain" src={source} alt={reference.name} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知大小'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="prompt-expand-panel max-w-4xl" aria-label="提示词放大编辑" aria-describedby={undefined}>
        <DialogHeader className="prompt-expand-head">
          <DialogTitle>提示词</DialogTitle>
          <span className="text-sm text-muted-foreground">
            {conversation.ratio} · {conversation.size} · {IMAGE_QUALITY_LABELS[conversation.quality]}
          </span>
        </DialogHeader>
        <Textarea
          className="prompt-expand-textarea min-h-[46vh] resize-none text-base"
          value={conversation.draftPrompt}
          placeholder="描述你想生成的画面..."
          autoFocus
          onChange={(event) => onPromptChange(event.target.value)}
        />
        <div className="prompt-expand-actions flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{conversation.draftPrompt.trim().length} 字符</span>
          <Button
            className="generate-button"
            type="button"
            onClick={() => {
              onClose()
              onGenerate()
            }}
            disabled={!conversation.draftPrompt.trim()}
          >
            {generating ? <Loader2 className="spin animate-spin" /> : <WandSparkles />}
            {generating ? '继续生成' : '生成图片'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
