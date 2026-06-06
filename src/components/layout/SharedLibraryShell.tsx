import type { ReactNode } from 'react'
import type { GlobalSettingsTab } from '../settings/global/GlobalSettingsModal'
import { AppTopNav } from './AppTopNav'

export function SharedLibraryShell({
  children,
  onOpenGlobalSettings
}: {
  children: ReactNode
  onOpenGlobalSettings: (tab?: GlobalSettingsTab) => void
}) {
  return (
    <div className="shell app-frame flex h-dvh min-h-[720px] min-w-[1080px] flex-col overflow-hidden bg-[radial-gradient(circle_at_0%_0%,hsl(var(--primary)/0.09),transparent_28%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--secondary)/0.55))]">
      <AppTopNav onOpenGlobalSettings={onOpenGlobalSettings} />
      <main className="main-surface min-h-0 flex-1 overflow-hidden bg-background">{children}</main>
    </div>
  )
}
