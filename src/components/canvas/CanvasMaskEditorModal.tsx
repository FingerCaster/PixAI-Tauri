import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Brush, Eraser, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CanvasNodeData } from '../../shared/types'

type CanvasMaskEditorModalProps = {
  node: CanvasNodeData
  source: string
  onSave: (maskDataUrl: string) => void | Promise<void>
  onClear: () => void | Promise<void>
  onClose: () => void
}

type MaskTool = 'paint' | 'erase'
type MaskPoint = { x: number; y: number }

export function CanvasMaskEditorModal({ node, source, onSave, onClear, onClose }: CanvasMaskEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<MaskPoint | null>(null)
  const [tool, setTool] = useState<MaskTool>('paint')
  const [brushSize, setBrushSize] = useState(48)

  const drawAtEvent = (event: PointerEvent<HTMLCanvasElement>, connectToPrevious: boolean) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const point = pointFromPointerEvent(canvas, event)
    context.save()
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = brushSize
    context.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over'
    context.strokeStyle = 'rgba(255,255,255,0.82)'
    context.fillStyle = 'rgba(255,255,255,0.82)'
    if (connectToPrevious && lastPointRef.current) {
      context.beginPath()
      context.moveTo(lastPointRef.current.x, lastPointRef.current.y)
      context.lineTo(point.x, point.y)
      context.stroke()
    } else {
      context.beginPath()
      context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
    lastPointRef.current = point
  }

  const clearSelection = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
  }

  const saveMask = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasSelection(canvas)) {
      void onClear()
      onClose()
      return
    }
    const maskDataUrl = exportOpenAiMaskDataUrl(canvas)
    if (!maskDataUrl) return
    void onSave(maskDataUrl)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-5xl" aria-label="Canvas mask 编辑器" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{node.title}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={tool === 'paint' ? 'secondary' : 'outline'}
              size="sm"
              title="画笔"
              onClick={() => setTool('paint')}
            >
              <Brush />
              画笔
            </Button>
            <Button
              type="button"
              variant={tool === 'erase' ? 'secondary' : 'outline'}
              size="sm"
              title="橡皮"
              onClick={() => setTool('erase')}
            >
              <Eraser />
              橡皮
            </Button>
            <label className="flex min-w-48 items-center gap-2 text-xs text-muted-foreground">
              <span>大小</span>
              <input
                className="w-36 accent-primary"
                type="range"
                min={8}
                max={160}
                step={1}
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
              />
              <span className="min-w-8 text-right tabular-nums">{brushSize}</span>
            </label>
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" title="清空 mask" onClick={clearSelection}>
                <Trash2 />
                清空
              </Button>
              <Button type="button" size="sm" title="保存 mask" onClick={saveMask}>
                <Save />
                保存
              </Button>
            </div>
          </div>
          <div className="grid max-h-[70vh] min-h-0 place-items-center overflow-auto rounded-lg bg-muted p-2" data-canvas-stop-zoom="true">
            <div className="relative inline-block max-h-[68vh] max-w-full">
              <img
                className="block max-h-[68vh] max-w-full object-contain"
                src={source}
                alt={node.title}
                draggable={false}
                onLoad={(event) => prepareMaskCanvas(canvasRef.current, event.currentTarget, node.metadata.maskDataUrl)}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full touch-none rounded-sm"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  drawingRef.current = true
                  lastPointRef.current = null
                  drawAtEvent(event, false)
                }}
                onPointerMove={(event) => {
                  event.stopPropagation()
                  if (!drawingRef.current) return
                  drawAtEvent(event, true)
                }}
                onPointerUp={(event) => {
                  event.stopPropagation()
                  drawingRef.current = false
                  lastPointRef.current = null
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }}
                onPointerCancel={() => {
                  drawingRef.current = false
                  lastPointRef.current = null
                }}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function prepareMaskCanvas(canvas: HTMLCanvasElement | null, image: HTMLImageElement, maskDataUrl?: string): void {
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  const width = Math.max(1, image.naturalWidth || image.clientWidth || 1)
  const height = Math.max(1, image.naturalHeight || image.clientHeight || 1)
  canvas.width = width
  canvas.height = height
  context.clearRect(0, 0, width, height)
  if (!maskDataUrl?.startsWith('data:image/')) return
  const maskImage = new Image()
  maskImage.onload = () => {
    drawOpenAiMaskAsSelection(canvas, maskImage)
  }
  maskImage.src = maskDataUrl
}

function drawOpenAiMaskAsSelection(canvas: HTMLCanvasElement, maskImage: HTMLImageElement): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const scratch = document.createElement('canvas')
  scratch.width = canvas.width
  scratch.height = canvas.height
  const scratchContext = scratch.getContext('2d')
  if (!scratchContext) return
  scratchContext.drawImage(maskImage, 0, 0, canvas.width, canvas.height)
  const maskPixels = scratchContext.getImageData(0, 0, canvas.width, canvas.height)
  const selectionPixels = context.createImageData(canvas.width, canvas.height)
  for (let index = 0; index < maskPixels.data.length; index += 4) {
    const selectedAlpha = 255 - maskPixels.data[index + 3]
    selectionPixels.data[index] = 255
    selectionPixels.data[index + 1] = 255
    selectionPixels.data[index + 2] = 255
    selectionPixels.data[index + 3] = selectedAlpha
  }
  context.putImageData(selectionPixels, 0, 0)
}

function pointFromPointerEvent(canvas: HTMLCanvasElement, event: PointerEvent<HTMLCanvasElement>): MaskPoint {
  const rect = canvas.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width
  const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height
  return {
    x: Math.max(0, Math.min(canvas.width, x)),
    y: Math.max(0, Math.min(canvas.height, y))
  }
}

function hasSelection(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext('2d')
  if (!context) return false
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let index = 3; index < pixels.data.length; index += 4) {
    if (pixels.data[index] > 0) return true
  }
  return false
}

function exportOpenAiMaskDataUrl(selectionCanvas: HTMLCanvasElement): string | null {
  const output = document.createElement('canvas')
  output.width = selectionCanvas.width
  output.height = selectionCanvas.height
  const context = output.getContext('2d')
  if (!context) return null
  context.fillStyle = 'rgba(0,0,0,1)'
  context.fillRect(0, 0, output.width, output.height)
  context.globalCompositeOperation = 'destination-out'
  context.drawImage(selectionCanvas, 0, 0)
  return output.toDataURL('image/png')
}
