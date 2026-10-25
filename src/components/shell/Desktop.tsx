import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarFlyout } from './CalendarFlyout'
import { DesktopIcons } from './DesktopIcons'
import { NotificationCenter } from './NotificationCenter'
import { StartMenu } from './StartMenu'
import { Taskbar } from './Taskbar'
import { Wallpaper } from './Wallpaper'
import { WindowLayer } from './WindowLayer'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SYNTHETIC_NOTICE } from '@/data/synthetic'
import { useDemo } from '@/store/demo-provider'
import { useWindows } from '@/store/window-provider'

type Flyout = 'start' | 'notifications' | 'calendar' | null

export function Desktop() {
  const { status, resetDemo, data, mode, apiBaseUrl } = useDemo()
  const { openApp, closeAllApps } = useWindows()
  const [flyout, setFlyout] = useState<Flyout>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const bootstrapped = useRef(false)

  useEffect(() => {
    if (status !== 'ready') return
    if (bootstrapped.current) return
    const timer = window.setTimeout(() => {
      bootstrapped.current = true
      openApp('vault')
    }, 600)
    return () => window.clearTimeout(timer)
  }, [status, openApp])

  useEffect(() => {
    if (!flyout) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setFlyout(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [flyout])

  const toggleFlyout = useCallback(
    (target: Exclude<Flyout, null>) => setFlyout((current) => (current === target ? null : target)),
    [],
  )

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-charcoal">
      <Wallpaper />

      <div className="absolute inset-x-0 top-0 z-10" style={{ bottom: 56 }}>
        <DesktopIcons />
        <WindowLayer />
      </div>

      {flyout && (
        <div
          className="absolute inset-0 z-40"
          role="presentation"
          onPointerDown={() => setFlyout(null)}
        />
      )}

      <StartMenu
        open={flyout === 'start'}
        onClose={() => setFlyout(null)}
        onRequestReset={() => {
          setFlyout(null)
          setResetOpen(true)
        }}
        onShowAbout={() => {
          setFlyout(null)
          setAboutOpen(true)
        }}
        onCloseAllWindows={() => {
          closeAllApps()
          setFlyout(null)
        }}
      />

      <NotificationCenter open={flyout === 'notifications'} onClose={() => setFlyout(null)} />
      <CalendarFlyout open={flyout === 'calendar'} />

      <Taskbar
        startOpen={flyout === 'start'}
        notificationsOpen={flyout === 'notifications'}
        calendarOpen={flyout === 'calendar'}
        onToggleStart={() => toggleFlyout('start')}
        onToggleNotifications={() => toggleFlyout('notifications')}
        onToggleCalendar={() => toggleFlyout('calendar')}
        onDismissFlyout={() => setFlyout(null)}
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset the demo workspace?"
        description="This restores the deterministic synthetic dataset and clears notifications and any local decisions you have made. It is the quickest way to repeat a presentation."
        confirmLabel="Reset demo"
        onConfirm={() => void resetDemo()}
      >
        <div className="rounded-lg border border-line bg-surface px-3 py-2.5 text-[11px] leading-5 text-ink-soft">
          {data?.documents.length ?? 28} synthetic records · 6 customers · 5 sources. Open windows
          stay open and reload their state.
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="About this DVault demo"
        description="A desktop-style preview of a data governance workspace, built as a frontend-only demonstration."
        confirmLabel="Got it"
        hideCancel
        onConfirm={() => undefined}
      >
        <div className="space-y-3 text-[11px] leading-5 text-ink-soft">
          <p>{SYNTHETIC_NOTICE}</p>
          <p>
            Phase 1 includes the Windows-style shell, the DVault workspace with Overview, Records
            and Vault sections, and the standalone File Explorer. Governance workflows, campaign
            approvals and the Security Center follow in later phases.
          </p>
          <p className="text-ink-faint">
            {mode === 'api'
              ? `This session reads from ${apiBaseUrl ?? 'the configured FastAPI backend'}. No real personal data is stored.`
              : 'Local demo mode makes no network requests and uses no real personal data.'}
          </p>
        </div>
      </ConfirmDialog>
    </div>
  )
}
