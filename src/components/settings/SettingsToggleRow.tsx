import { CircleHelp } from 'lucide-react'

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
    <button className="toggle-row" type="button" onClick={onChange}>
      <span className="field-label-with-help">
        <span>{label}</span>
        {help ? (
          <span className="info-icon" title={help} aria-label={`${label}说明`}>
            <CircleHelp size={14} />
          </span>
        ) : null}
      </span>
      <span className={`switch ${checked ? '' : 'off'}`} />
    </button>
  )
}
