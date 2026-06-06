import { CircleHelp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SettingsToggleRow({
  label,
  help,
  checked,
  onChange
}: {
  label: string
  help?: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      className="toggle-row flex min-h-11 w-full items-center justify-between gap-4 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/60"
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span className="field-label-with-help flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
        {help ? (
          <span
            className="info-icon inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title={help}
            aria-label={`${label}说明`}
          >
            <CircleHelp size={14} />
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-[18.4px] w-8 shrink-0 items-center rounded-full border border-transparent transition-all',
          checked ? 'bg-primary' : 'off bg-input dark:bg-input/80'
        )}
      >
        <span
          className={cn(
            'block size-4 rounded-full bg-background transition-transform dark:data-[checked=true]:bg-primary-foreground dark:data-[checked=false]:bg-foreground',
            checked ? 'translate-x-[calc(100%-2px)]' : 'translate-x-0'
          )}
          data-checked={checked}
        />
      </span>
    </button>
  )
}
