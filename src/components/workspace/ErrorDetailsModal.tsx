import { useEffect, useMemo } from 'react'
import { Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ImageGenerationCallLog, ImageHistoryItem } from '../../shared/types'
import { useAppStore } from '../../store/app-store'

type ErrorPayload = {
  stage?: unknown
  timestamp?: unknown
  request?: unknown
  details?: unknown
}

export function ErrorDetailsModal({ item, onClose }: { item: ImageHistoryItem; onClose: () => void }) {
  const notify = useAppStore((state) => state.notify)
  const payload = useMemo(() => parseErrorPayload(item.errorDetails), [item.errorDetails])
  const details = isRecord(payload?.details) ? payload.details : null
  const responseBody = typeof details?.responseBody === 'string' ? details.responseBody : null
  const callLog = item.callLog
  const rawErrorText = item.errorDetails || item.errorMessage || '生成失败'
  const copyText = useMemo(() => buildDiagnosticsCopyText(item, payload), [item, payload])
  const title = callLog ? '错误与调用日志' : (item.errorMessage || '生成失败')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const copyError = async () => {
    try {
      await navigator.clipboard.writeText(copyText)
      notify(callLog ? '已复制错误和调用日志' : '已复制错误信息')
    } catch (error) {
      notify(error instanceof Error ? `复制失败：${error.message}` : '复制失败')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="provider-modal error-details-panel max-w-4xl"
        overlayClassName="error-details-backdrop"
        overlayProps={{
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose()
          },
          onClick: (event) => event.stopPropagation()
        }}
        showCloseButton={false}
        aria-label={callLog ? '错误与调用日志' : '错误详情'}
        aria-describedby={undefined}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader className="modal-head flex-row items-center justify-between gap-3 space-y-0">
          <DialogTitle className="line-clamp-2 text-base">{title}</DialogTitle>
          <div className="mini-controls flex items-center gap-1 pr-7">
            <Button className="icon-button" variant="outline" size="icon-sm" type="button" title={callLog ? '复制错误和调用日志' : '复制全部错误信息'} onClick={() => void copyError()}>
              <Copy size={15} />
            </Button>
            <Button className="icon-button" variant="outline" size="icon-sm" type="button" title="关闭" onClick={onClose}>
              <X size={15} />
            </Button>
          </div>
        </DialogHeader>
        <div className="error-details-body grid max-h-[70vh] gap-3 overflow-auto">
          {callLog ? <h3 className="text-sm font-semibold">错误日志</h3> : null}
          <div className="error-details-meta flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {renderMetaText('阶段', payload?.stage)}
            {renderMetaSeparator()}
            {renderMetaText('时间', formatErrorTimestamp(payload?.timestamp) || item.createdAt)}
            {renderMetaSeparator()}
            {renderMetaText('接口', details?.endpoint)}
          </div>
          <ErrorSection title="请求参数" value={payload?.request ?? '无请求参数'} />
          <ErrorSection title="响应体" value={responseBody ?? details?.responseError ?? details ?? '无响应体'} />
          <ErrorSection title="原始错误详情" value={payload ?? rawErrorText} />
          {callLog ? <CallLogDetails log={callLog} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ErrorSection({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="error-details-section rounded-xl border border-border bg-muted/30 p-3">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-xs text-muted-foreground">{formatDetailValue(value)}</pre>
    </section>
  )
}

function CallLogDetails({ log }: { log: ImageGenerationCallLog }) {
  return (
    <div className="call-log-details grid gap-3 pt-2">
      <h3 className="text-sm font-semibold">调用日志</h3>
      <div className="call-log-meta flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {renderMetaText('供应商', log.provider.name)}
        {renderMetaSeparator()}
        {renderMetaText('端点', log.endpoint)}
        {renderMetaSeparator()}
        {renderMetaText('传输', formatTransport(log.transport))}
        {renderMetaSeparator()}
        {renderMetaText('时间', formatCallLogTimestamp(log.createdAt))}
      </div>
      <p className="text-xs text-muted-foreground">Authorization 与图片二进制/base64 已脱敏或摘要化，其他字段保持真实请求结构。</p>
      <ErrorSection title="供应商" value={log.provider} />
      <ErrorSection title="请求 Headers" value={log.request.headers} />
      <ErrorSection title="真实请求 Body" value={log.request.body} />
      <ErrorSection title="完整调用日志" value={log} />
    </div>
  )
}

function parseErrorPayload(errorDetails: string | null): ErrorPayload | null {
  if (!errorDetails) return null
  try {
    const payload = JSON.parse(errorDetails) as ErrorPayload
    return isRecord(payload) ? payload : null
  } catch {
    return null
  }
}

function renderMetaText(label: string, value: unknown) {
  if (value === null || value === undefined || value === '') return null
  return (
    <span className="error-details-meta-item inline-flex items-center gap-1">
      <span className="error-details-meta-label font-medium text-foreground">{label}</span>
      <span className="error-details-meta-value">{String(value)}</span>
    </span>
  )
}

function renderMetaSeparator() {
  return <span className="error-details-meta-separator">|</span>
}

function buildDiagnosticsCopyText(item: ImageHistoryItem, payload: ErrorPayload | null): string {
  const errorText = item.errorDetails || item.errorMessage || '生成失败'
  if (!item.callLog) return errorText
  return JSON.stringify({
    error: payload ?? errorText,
    callLog: item.callLog
  }, null, 2)
}

function formatErrorTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? value : time.toLocaleString()
}

function formatTransport(transport: ImageGenerationCallLog['transport']): string {
  if (transport === 'streaming-json') return 'Streaming JSON'
  if (transport === 'streaming-multipart') return 'Streaming Multipart'
  if (transport === 'multipart') return 'Multipart'
  return 'JSON'
}

function formatCallLogTimestamp(value: string): string {
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? value : time.toLocaleString()
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '无'
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return '无'
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2) || '无'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
