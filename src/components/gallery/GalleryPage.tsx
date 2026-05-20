import { Download, Heart, Search, Square, SquareCheckBig, Trash2, WandSparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ImageTile } from '../workspace/ImageTile'
import { useAppStore } from '../../store/app-store'

export function GalleryPage() {
  const { favoritesOnly, history, query, reloadHistory, setFavoritesOnly, setQuery, deleteHistory, reuseHistory, toggleFavorite, notify } = useAppStore()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const filtered = useMemo(() => history.filter((item) => {
    const q = query.trim().toLowerCase()
    return !q || `${item.prompt} ${item.model} ${item.size || ''}`.toLowerCase().includes(q)
  }), [history, query])
  const selectedItems = filtered.filter((item) => selectedIds.includes(item.id))
  const selectableIds = filtered.map((item) => item.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id))

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : selectableIds)
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  const downloadSelected = () => {
    selectedItems.filter((item) => item.dataUrl).forEach((item) => downloadDataUrl(item.dataUrl as string, item.id))
    notify(`已开始下载 ${selectedItems.filter((item) => item.dataUrl).length} 张图片`)
  }

  const deleteSelected = async () => {
    for (const item of selectedItems) {
      await deleteHistory(item.id)
    }
    setSelectedIds([])
  }

  const favoriteSelected = async (favorite: boolean) => {
    for (const item of selectedItems) {
      if (item.favorite !== favorite) await toggleFavorite(item)
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">图库</span>
          <h1>跨会话历史</h1>
        </div>
        <div className="toolbar">
          <label className="search">
              <Search size={15} />
              <input
                value={query}
              placeholder="搜索提示词 / 模型 / 尺寸"
              onChange={(event) => {
                setQuery(event.target.value)
                void reloadHistory({ query: event.target.value })
              }}
            />
          </label>
          <button type="button" className={favoritesOnly ? 'active' : ''} onClick={() => void setFavoritesOnly(!favoritesOnly)}>
            <Heart size={15} />
            收藏
          </button>
          <button type="button" onClick={toggleSelectAll}>
            {allSelected ? <SquareCheckBig size={15} /> : <Square size={15} />}
            全选
          </button>
          <button type="button" onClick={downloadSelected} disabled={selectedItems.length === 0}>
            <Download size={15} />
            下载
          </button>
          <button type="button" onClick={() => void favoriteSelected(true)} disabled={selectedItems.length === 0}>
            <Heart size={15} />
            收藏选中
          </button>
          <button type="button" onClick={() => void favoriteSelected(false)} disabled={selectedItems.length === 0}>
            取消收藏
          </button>
          <button type="button" onClick={() => void deleteSelected()} disabled={selectedItems.length === 0}>
            <Trash2 size={15} />
            删除选中
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">图库还是空的。</div>
      ) : (
        <div className="gallery-list">
          {filtered.map((item) => (
            <div className="gallery-item" key={item.id}>
              <label className="selection-row">
                <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} />
                选择
              </label>
              <ImageTile item={item} />
              <div className="gallery-actions">
                <button type="button" onClick={() => void reuseHistory(item)}>
                  <WandSparkles size={15} />
                  回填参数
                </button>
                <button type="button" onClick={() => void deleteHistory(item.id)}>
                  <Trash2 size={15} />
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function downloadDataUrl(dataUrl: string, id: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `${id}.${extensionFromDataUrl(dataUrl)}`
  link.click()
}

function extensionFromDataUrl(dataUrl: string): string {
  const mimeType = /^data:([^;]+);base64,/i.exec(dataUrl)?.[1] || ''
  if (mimeType.includes('jpeg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  return 'png'
}
