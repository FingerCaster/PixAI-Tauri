import { Download, Heart, Search, Square, SquareCheckBig, Trash2, WandSparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ImageTile } from '../workspace/ImageTile'
import { DownloadCanceledError, downloadImageSource } from '../../lib/platform'
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

  const downloadSelected = async () => {
    const downloadable = selectedItems.filter((item) => item.dataUrl || item.storagePath)
    let count = 0
    for (const item of downloadable) {
      try {
        await downloadImageSource(
          item.dataUrl,
          `${item.id}.${extensionFromDataUrl(item.dataUrl || item.storagePath || '')}`,
          item.storagePath
        )
        count += 1
      } catch (error) {
        if (error instanceof DownloadCanceledError) break
        // Keep batch downloads moving when one history item is no longer available.
      }
    }
    notify(count > 0 ? `已保存 ${count} 张图片` : '没有可下载的图片')
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
          <button type="button" onClick={() => void downloadSelected()} disabled={selectedItems.length === 0}>
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

function extensionFromDataUrl(dataUrl: string): string {
  if (!dataUrl.startsWith('data:')) {
    const extension = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(dataUrl)?.[1]?.toLowerCase()
    return extension === 'jpg' || extension === 'jpeg' || extension === 'webp' ? extension : 'png'
  }
  const mimeType = /^data:([^;]+);base64,/i.exec(dataUrl)?.[1] || ''
  if (mimeType.includes('jpeg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  return 'png'
}
