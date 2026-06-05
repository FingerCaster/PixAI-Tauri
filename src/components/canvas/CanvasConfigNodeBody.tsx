import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { IMAGE_QUALITIES, IMAGE_QUALITY_LABELS, IMAGE_RATIOS } from '../../shared/image-options'
import type { CanvasNodeData, CanvasNodeMetadata, ImageQuality, ImageRatio } from '../../shared/types'

type CanvasConfigNodeBodyProps = {
  node: CanvasNodeData
  onMetadataChange: (patch: Partial<CanvasNodeMetadata>) => void | Promise<void>
}

const INHERIT_VALUE = '__inherit'

export function CanvasConfigNodeBody({ node, onMetadataChange }: CanvasConfigNodeBodyProps) {
  const ratio = node.metadata.ratio || INHERIT_VALUE
  const quality = node.metadata.quality || INHERIT_VALUE
  const n = node.metadata.n ?? 1

  return (
    <div className="grid h-full min-h-0 content-start gap-3 bg-background/35 p-3 text-xs">
      <label className="grid gap-1.5">
        <span className="font-medium text-muted-foreground">比例</span>
        <Select
          value={ratio}
          onValueChange={(value) => {
            void onMetadataChange({ ratio: value === INHERIT_VALUE ? undefined : value as ImageRatio })
          }}
        >
          <SelectTrigger size="sm" className="w-full" onPointerDown={(event) => event.stopPropagation()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT_VALUE}>继承</SelectItem>
            {IMAGE_RATIOS.map((item) => (
              <SelectItem key={item} value={item}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1.5">
        <span className="font-medium text-muted-foreground">质量</span>
        <Select
          value={quality}
          onValueChange={(value) => {
            void onMetadataChange({ quality: value === INHERIT_VALUE ? undefined : value as ImageQuality })
          }}
        >
          <SelectTrigger size="sm" className="w-full" onPointerDown={(event) => event.stopPropagation()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT_VALUE}>继承</SelectItem>
            {IMAGE_QUALITIES.map((item) => (
              <SelectItem key={item} value={item}>{IMAGE_QUALITY_LABELS[item]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1.5">
        <span className="font-medium text-muted-foreground">数量</span>
        <Input
          type="number"
          min={1}
          max={4}
          value={n}
          className="h-8 text-xs"
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10)
            void onMetadataChange({ n: Number.isFinite(next) ? Math.max(1, Math.min(4, next)) : undefined })
          }}
        />
      </label>
    </div>
  )
}
