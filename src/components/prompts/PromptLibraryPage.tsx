import { Copy, Pencil, Plus, Trash2, WandSparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { PromptTemplate } from '../../shared/types'
import { useAppStore } from '../../store/app-store'

export function PromptLibraryPage() {
  const { applyPromptTemplate, deleteTemplate, notify, saveTemplate, templates } = useAppStore()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<PromptTemplate | null>(null)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templates.filter((template) => !q || `${template.title} ${template.category} ${template.prompt}`.toLowerCase().includes(q))
  }, [query, templates])

  const copyPrompt = async (prompt: string) => {
    await navigator.clipboard.writeText(prompt)
    notify('提示词已复制')
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">提示词库</span>
          <h1>提示词库</h1>
        </div>
        <div className="toolbar">
          <input value={query} placeholder="搜索模板" onChange={(event) => setQuery(event.target.value)} />
          <button
            type="button"
            onClick={() =>
              setDraft({
                id: '',
                title: '',
                category: '自定义',
                prompt: '',
                ratio: '1:1',
                quality: 'high',
                createdAt: '',
                updatedAt: ''
              })
            }
          >
            <Plus size={15} />
            新建
          </button>
        </div>
      </div>
      {draft ? (
        <form
          className="template-editor"
          onSubmit={(event) => {
            event.preventDefault()
            void saveTemplate({
              id: draft.id || undefined,
              title: draft.title,
              category: draft.category,
              prompt: draft.prompt,
              ratio: draft.ratio,
              quality: draft.quality
            }).then(() => setDraft(null))
          }}
        >
          <input value={draft.title} placeholder="标题" onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <input value={draft.category} placeholder="分类" onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
          <textarea value={draft.prompt} placeholder="提示词正文" onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} />
          <div className="button-row">
            <button type="submit">保存模板</button>
            <button type="button" onClick={() => setDraft(null)}>
              取消
            </button>
          </div>
        </form>
      ) : null}
      <div className="template-grid">
        {filtered.map((template) => (
          <article className="template-card" key={template.id}>
            <div>
              <span>{template.category}</span>
              <h3>{template.title}</h3>
              <p>{template.prompt}</p>
            </div>
            <div className="tile-actions">
              <button type="button" onClick={() => void applyPromptTemplate(template)} title="套用">
                <WandSparkles size={15} />
              </button>
              <button type="button" onClick={() => void copyPrompt(template.prompt)} title="复制">
                <Copy size={15} />
              </button>
              <button type="button" onClick={() => setDraft(template)} title="编辑">
                <Pencil size={15} />
              </button>
              <button type="button" onClick={() => void deleteTemplate(template.id)} title="删除">
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
