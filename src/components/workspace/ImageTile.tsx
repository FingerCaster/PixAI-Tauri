import { useState } from 'react'
import { Copy, Download, Edit3, Heart, ImageDown, Trash2 } from 'lucide-react'
import type { ImageHistoryItem } from '../../shared/types'
import { formatDuration } from '../../lib/time'
import { useAppStore } from '../../store/app-store'
import { shouldShowFailedImageRetryChip } from '../../generation-retry-display'
import { ErrorDetailsModal } from './ErrorDetailsModal'

export function ImageTile({ item }: { item: ImageHistoryItem }) {
  const { addHistoryAsReference, deleteHistory, notify, toggleFavorite } = useAppStore()
  const [errorDetailsOpen, setErrorDetailsOpen] = useState(false)
  const showFailedRetryChip = shouldShowFailedImageRetryChip(item.retryAttempt)
  const copyPrompt = async () => {
    await navigator.clipboard.writeText(item.prompt)
    notify('提示词已复制')
  }
  const copyImage = async () => {
    if (!item.dataUrl) return
    if (!item.dataUrl.startsWith('data:')) {
      await navigator.clipboard.writeText(item.dataUrl)
      notify('图片链接已复制')
      return
    }
    try {
      const blob = dataUrlToBlob(item.dataUrl)
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      notify('图片已复制')
    } catch {
      await navigator.clipboard.writeText(item.dataUrl)
      notify('图片数据已复制')
    }
  }
  const downloadImage = () => {
    if (!item.dataUrl) return
    const link = document.createElement('a')
    link.href = item.dataUrl
    link.download = `${item.id}.${extensionFromDataUrl(item.dataUrl)}`
    link.click()
    notify('图片下载已开始')
  }

  if (item.status === 'failed') {
    return (
      <article
        className="image-tile failed error-tile"
        role="button"
        tabIndex={0}
        title="点击查看错误详情"
        onClick={() => setErrorDetailsOpen(true)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          setErrorDetailsOpen(true)
        }}
      >
        <div className="image-frame fail-content">
          <strong>{item.errorMessage || '生成失败'}</strong>
          {showFailedRetryChip ? <span className="retry-chip">{`重试第 ${item.retryAttempt} 次`}</span> : null}
          <span>点击查看错误详情</span>
        </div>
        <div className="tile-actions">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              void deleteHistory(item.id)
            }}
            title="删除"
          >
            <Trash2 size={15} />
          </button>
        </div>
        {errorDetailsOpen ? <ErrorDetailsModal item={item} onClose={() => setErrorDetailsOpen(false)} /> : null}
      </article>
    )
  }

  return (
    <article className="image-tile">
      <div className="image-frame">
        {item.dataUrl ? <img src={item.dataUrl} alt={item.prompt} /> : null}
      </div>
      <div className="tile-body">
        <strong>{item.prompt}</strong>
        <span>
          {item.model} · {item.size || item.ratio}
          {item.durationMs != null ? ` · ${formatDuration(item.durationMs)}` : ''}
        </span>
      </div>
      <div className="tile-actions">
        <button type="button" onClick={copyPrompt} title="复制提示词">
          <Copy size={15} />
        </button>
        {item.dataUrl ? (
          <>
            <button type="button" onClick={() => void copyImage()} title="复制图片">
              <ImageDown size={15} />
            </button>
            <button type="button" onClick={downloadImage} title="下载图片">
              <Download size={15} />
            </button>
            <button type="button" onClick={() => void addHistoryAsReference(item.id)} title="作为参考图编辑">
              <Edit3 size={15} />
            </button>
          </>
        ) : null}
        <button type="button" onClick={() => void toggleFavorite(item)} title="收藏">
          <Heart size={15} fill={item.favorite ? 'currentColor' : 'none'} />
        </button>
        <button type="button" onClick={() => void deleteHistory(item.id)} title="删除">
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  )
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) return new Blob([dataUrl], { type: 'text/plain' })
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: match[1] })
}

function extensionFromDataUrl(dataUrl: string): string {
  const mimeType = /^data:([^;]+);base64,/i.exec(dataUrl)?.[1] || ''
  if (mimeType.includes('jpeg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  return 'png'
}
