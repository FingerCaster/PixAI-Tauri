import { useEffect, useRef, useState } from 'react'
import { Download, HelpCircle, ImageUp, ListPlus, PanelTop, Play, RotateCcw, SlidersHorizontal, Type, Upload, WandSparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { DownloadCanceledError, downloadTextFile, readTextFile, storeDataUrlFile } from '../../lib/platform'
import { pixaiApi } from '../../services/app-api'
import { useAppStore } from '../../store/app-store'
import { useCanvasStore } from '../../store/canvas-store'
import { CanvasViewport } from './CanvasViewport'

const CANVAS_GUIDE_DISMISSED_KEY = 'pixai-canvas-guide-dismissed-v1'

export function CanvasWorkspace() {
  const createCanvasProject = useAppStore((state) => state.createCanvasProject)
  const notify = useAppStore((state) => state.notify)
  const openCanvasProject = useAppStore((state) => state.openCanvasProject)
  const activeProject = useCanvasStore((state) => state.activeProject)
  const errorMessage = useCanvasStore((state) => state.errorMessage)
  const exportActiveProject = useCanvasStore((state) => state.exportActiveProject)
  const importProjectFromJson = useCanvasStore((state) => state.importProjectFromJson)
  const loading = useCanvasStore((state) => state.loading)
  const projects = useCanvasStore((state) => state.projects)
  const addImageNode = useCanvasStore((state) => state.addImageNode)
  const addBatchNode = useCanvasStore((state) => state.addBatchNode)
  const addConfigNode = useCanvasStore((state) => state.addConfigNode)
  const addGenerateNode = useCanvasStore((state) => state.addGenerateNode)
  const addResultNode = useCanvasStore((state) => state.addResultNode)
  const addTextNode = useCanvasStore((state) => state.addTextNode)
  const addConnection = useCanvasStore((state) => state.addConnection)
  const deleteConnection = useCanvasStore((state) => state.deleteConnection)
  const deleteNode = useCanvasStore((state) => state.deleteNode)
  const moveNode = useCanvasStore((state) => state.moveNode)
  const resetViewport = useCanvasStore((state) => state.resetViewport)
  const updateNodeContent = useCanvasStore((state) => state.updateNodeContent)
  const updateNodeMetadata = useCanvasStore((state) => state.updateNodeMetadata)
  const updateViewport = useCanvasStore((state) => state.updateViewport)
  const generateCanvasNode = useAppStore((state) => state.generateCanvasNode)
  const runCanvasWorkflow = useAppStore((state) => state.runCanvasWorkflow)
  const enrichCanvasTextNode = useAppStore((state) => state.enrichCanvasTextNode)
  const generationPreviews = useAppStore((state) => state.generationPreviews)
  const promptEnriching = useAppStore((state) => state.promptAssistantRunning.enrich)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideAutoChecked, setGuideAutoChecked] = useState(false)
  const nodeCount = activeProject?.nodes.length || 0

  useEffect(() => {
    if (!activeProject || guideAutoChecked) return
    setGuideAutoChecked(true)
    if (!isCanvasGuideDismissed()) setGuideOpen(true)
  }, [activeProject, guideAutoChecked])

  if (!activeProject) {
    return (
      <section className="canvas-workspace grid h-full place-items-center bg-background p-4">
        <div className="grid gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center shadow-sm">
          <div className="text-base font-semibold">还没有 Canvas 项目</div>
          <div className="text-sm text-muted-foreground">新建一个项目后，就可以开始排布节点、连线和生成。</div>
          <Button type="button" className="justify-self-center" onClick={() => void createCanvasProject()}>
            新建 Canvas 项目
          </Button>
        </div>
      </section>
    )
  }

  const exportCanvasProject = async () => {
    try {
      const project = await exportActiveProject()
      if (!project) {
        notify('没有可导出的 Canvas 项目')
        return
      }
      await downloadTextFile(canvasProjectFilename(project.title), JSON.stringify(project, null, 2), 'application/json')
      notify('Canvas 项目已导出')
    } catch (error) {
      if (error instanceof DownloadCanceledError) return
      notify(error instanceof Error ? error.message : 'Canvas 项目导出失败')
    }
  }

  const importCanvasProjectFile = async (file: File) => {
    let hiddenConversationId: string | null = null
    try {
      const payload = JSON.parse(await readTextFile(file))
      const hiddenConversation = await pixaiApi.conversation.create()
      hiddenConversationId = hiddenConversation.id
      useAppStore.setState({
        conversations: [hiddenConversation, ...useAppStore.getState().conversations.filter((conversation) => conversation.id !== hiddenConversation.id)]
      })
      const project = await importProjectFromJson(payload, hiddenConversation.id)
      if (!project) {
        throw new Error(useCanvasStore.getState().errorMessage || 'Canvas 项目导入失败')
      }
      await openCanvasProject(project.id)
      notify('Canvas 项目已导入')
    } catch (error) {
      if (hiddenConversationId) {
        await pixaiApi.conversation.delete(hiddenConversationId).catch(() => undefined)
        useAppStore.setState({
          conversations: useAppStore.getState().conversations.filter((conversation) => conversation.id !== hiddenConversationId)
        })
      }
      notify(error instanceof Error ? error.message : 'Canvas 项目导入失败')
    }
  }

  const closeGuide = (message?: string) => {
    markCanvasGuideDismissed()
    setGuideOpen(false)
    if (message) notify(message)
  }

  return (
    <section className="canvas-workspace grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden bg-background p-4">
      <header className="grid gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm lg:min-h-14 lg:grid-cols-[minmax(170px,1fr)_auto_auto] lg:items-center">
        <div className="grid min-w-0 gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{activeProject?.title || 'Canvas 项目'}</h1>
            <Badge variant="outline" className="h-5 px-1.5 text-[11px]">Canvas</Badge>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {activeProject ? `${nodeCount} 个节点 · ${projects.length || 1} 个项目` : '正在加载项目'}
          </p>
        </div>
        <div className="flex min-w-0 items-center justify-center gap-1 rounded-lg border border-border bg-muted/35 p-1">
          <Button className="h-8 px-2 text-xs" type="button" variant="ghost" disabled={!activeProject || loading} onClick={() => void addTextNode()}>
            <Type />
            文本
          </Button>
          <Button className="h-8 px-2 text-xs" type="button" variant="ghost" disabled={!activeProject || loading} onClick={() => imageInputRef.current?.click()}>
            <ImageUp />
            图片
          </Button>
          <Button className="h-8 px-2 text-xs" type="button" variant="ghost" disabled={!activeProject || loading} onClick={() => void addGenerateNode()}>
            <WandSparkles />
            生成
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 px-2 text-xs" type="button" variant="ghost" disabled={!activeProject || loading}>
                <SlidersHorizontal />
                高级
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem onSelect={() => void addConfigNode()}>
                <SlidersHorizontal />
                配置节点
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void addBatchNode()}>
                <ListPlus />
                批量节点
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void addResultNode()}>
                <PanelTop />
                结果节点
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {errorMessage ? <Badge variant="destructive" className="max-w-36 truncate">{errorMessage}</Badge> : null}
          <Button className="h-8 px-2 text-xs" type="button" variant="ghost" disabled={!activeProject || loading} onClick={() => setGuideOpen(true)} title="查看 Canvas 引导">
            <HelpCircle />
            引导
          </Button>
          <Button className="h-8 px-2 text-xs" type="button" variant="outline" disabled={!activeProject || loading} onClick={() => void exportCanvasProject()}>
            <Download />
            导出
          </Button>
          <Button className="h-8 px-2 text-xs" type="button" variant="outline" disabled={loading} onClick={() => projectInputRef.current?.click()}>
            <Upload />
            导入
          </Button>
          <Button className="h-8 px-2 text-xs" type="button" variant="ghost" disabled={!activeProject || loading} onClick={() => void resetViewport()} title="重置视图">
            <RotateCcw />
            重置
          </Button>
          <Button className="h-8 px-3 text-xs font-semibold" type="button" disabled={!activeProject || loading} onClick={() => void runCanvasWorkflow()}>
            <Play />
            运行
          </Button>
          <input
            ref={imageInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.currentTarget.value = ''
              if (!file) return
              void readImageFile(file)
                .then(async (image) => {
                  await addImageNode({
                    name: file.name,
                    dataUrl: image.dataUrl,
                    mimeType: image.mimeType,
                    fileSizeBytes: image.fileSizeBytes,
                    storagePath: image.storagePath,
                    naturalWidth: image.naturalWidth,
                    naturalHeight: image.naturalHeight
                  })
                  notify('图片已加入 Canvas')
                })
                .catch((error) => notify(error instanceof Error ? error.message : '图片加入 Canvas 失败'))
            }}
          />
          <input
            ref={projectInputRef}
            className="hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.currentTarget.value = ''
              if (!file) return
              void importCanvasProjectFile(file)
            }}
          />
        </div>
      </header>
      <CanvasViewport
        viewport={activeProject?.viewport || { x: 0, y: 0, k: 1 }}
        nodes={activeProject?.nodes || []}
        connections={activeProject?.connections || []}
        loading={loading || !activeProject}
        onViewportCommit={(viewport) => updateViewport(viewport)}
        onNodeMove={(nodeId, position) => moveNode(nodeId, position)}
        onNodeContentChange={(nodeId, content) => updateNodeContent(nodeId, content)}
        onNodeMetadataChange={(nodeId, patch) => updateNodeMetadata(nodeId, patch)}
        onNodeDelete={(nodeId) => deleteNode(nodeId)}
        onConnectionAdd={(fromNodeId, toNodeId) => addConnection(fromNodeId, toNodeId)}
        onConnectionDelete={(connectionId) => deleteConnection(connectionId)}
        onTextNodeEnrich={(nodeId) => enrichCanvasTextNode(nodeId)}
        onGenerateNodeRun={(nodeId) => generateCanvasNode(nodeId)}
        generationPreviews={generationPreviews}
        promptEnriching={promptEnriching}
      />
      <CanvasGuideDialog
        open={guideOpen}
        onClose={() => closeGuide()}
        onSkip={() => closeGuide('之后可点击工具栏“引导”重新查看 Canvas 用法')}
      />
    </section>
  )
}

function CanvasGuideDialog({
  open,
  onClose,
  onSkip
}: {
  open: boolean
  onClose: () => void
  onSkip: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent className="max-w-2xl" aria-label="Canvas 引导" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Canvas 快速引导</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-sm text-muted-foreground">
          <GuideStep title="最小生成链路" body="添加文本节点和生成节点，先点文本节点右上角链条，再点生成节点右上角链条，最后点生成节点里的运行。" />
          <GuideStep title="参考图和结果" body="添加本地图片，或从图库里把历史图加入 Canvas 后，连到生成节点即可作为参考图；生成节点连到结果节点后，结果会写进结果节点。" />
          <GuideStep title="工作流" body="配置节点控制比例、质量和数量；批量节点按行提供变体；运行工作流会顺序执行，当前最多 8 次请求。" />
          <GuideStep title="不会用时" body="工具栏里的引导按钮会一直保留，跳过首次引导后也可以随时重新打开。" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onSkip}>
            跳过，稍后看引导
          </Button>
          <Button type="button" onClick={onClose}>
            开始使用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GuideStep({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/35 p-3">
      <div className="mb-1 font-medium text-foreground">{title}</div>
      <div>{body}</div>
    </div>
  )
}

function canvasProjectFilename(title: string): string {
  const stem = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return `${stem || 'canvas-project'}.json`
}

type LocalCanvasImageFile = {
  dataUrl: string
  mimeType: string
  fileSizeBytes: number
  storagePath: string | null
  naturalWidth?: number
  naturalHeight?: number
}

async function readImageFile(file: File): Promise<LocalCanvasImageFile> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。')
  const [dataUrl, buffer] = await Promise.all([
    readFileAsDataUrl(file),
    readFileAsArrayBuffer(file).catch(() => null)
  ])
  const stored = await storeDataUrlFile('references', file.name || 'canvas-image.png', dataUrl)
  const naturalSize = buffer ? parseImageNaturalSize(buffer) : null
  return {
    dataUrl: stored.dataUrl,
    mimeType: file.type || stored.mimeType || 'image/png',
    fileSizeBytes: stored.fileSizeBytes || file.size,
    storagePath: stored.path || null,
    ...(naturalSize || {})
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('无法读取图片文件。'))
    reader.readAsDataURL(file)
  })
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error || new Error('无法读取图片文件。'))
    reader.readAsArrayBuffer(file)
  })
}

function parseImageNaturalSize(buffer: ArrayBuffer): { naturalWidth: number; naturalHeight: number } | null {
  const bytes = new Uint8Array(buffer)
  return parsePngNaturalSize(bytes) || parseJpegNaturalSize(bytes) || parseWebpNaturalSize(bytes)
}

function parsePngNaturalSize(bytes: Uint8Array): { naturalWidth: number; naturalHeight: number } | null {
  if (bytes.length < 24) return null
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  if (!isPng) return null
  const naturalWidth = readUint32BE(bytes, 16)
  const naturalHeight = readUint32BE(bytes, 20)
  return naturalWidth > 0 && naturalHeight > 0 ? { naturalWidth, naturalHeight } : null
}

function parseJpegNaturalSize(bytes: Uint8Array): { naturalWidth: number; naturalHeight: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) break
    if (offset + 2 > bytes.length) break
    const length = readUint16BE(bytes, offset)
    if (length < 2 || offset + length > bytes.length) break
    if (isJpegStartOfFrame(marker) && offset + 7 < bytes.length) {
      const naturalHeight = readUint16BE(bytes, offset + 3)
      const naturalWidth = readUint16BE(bytes, offset + 5)
      return naturalWidth > 0 && naturalHeight > 0 ? { naturalWidth, naturalHeight } : null
    }
    offset += length
  }
  return null
}

function parseWebpNaturalSize(bytes: Uint8Array): { naturalWidth: number; naturalHeight: number } | null {
  if (bytes.length < 30 || textAt(bytes, 0, 4) !== 'RIFF' || textAt(bytes, 8, 4) !== 'WEBP') return null
  const chunk = textAt(bytes, 12, 4)
  if (chunk === 'VP8X') {
    const naturalWidth = readUint24LE(bytes, 24) + 1
    const naturalHeight = readUint24LE(bytes, 27) + 1
    return naturalWidth > 0 && naturalHeight > 0 ? { naturalWidth, naturalHeight } : null
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const naturalWidth = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8)
    const naturalHeight = 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)
    return naturalWidth > 0 && naturalHeight > 0 ? { naturalWidth, naturalHeight } : null
  }
  if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const naturalWidth = readUint16LE(bytes, 26) & 0x3fff
    const naturalHeight = readUint16LE(bytes, 28) & 0x3fff
    return naturalWidth > 0 && naturalHeight > 0 ? { naturalWidth, naturalHeight } : null
  }
  return null
}

function isJpegStartOfFrame(marker: number): boolean {
  return marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3
    || marker === 0xc5 || marker === 0xc6 || marker === 0xc7
    || marker === 0xc9 || marker === 0xca || marker === 0xcb
    || marker === 0xcd || marker === 0xce || marker === 0xcf
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) + bytes[offset + 1]
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8)
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16)
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]
}

function textAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}

function isCanvasGuideDismissed(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(CANVAS_GUIDE_DISMISSED_KEY) === '1'
  } catch {
    return true
  }
}

function markCanvasGuideDismissed(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CANVAS_GUIDE_DISMISSED_KEY, '1')
  } catch {
    // Guide persistence is best effort only.
  }
}
