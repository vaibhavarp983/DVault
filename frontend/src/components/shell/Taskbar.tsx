import { useEffect, useState } from 'react'
import { Bell, Search, ShieldCheck, Volume2, Wifi } from 'lucide-react'
import { APP_META, APP_ORDER } from '@/apps/app-meta'
import { DVaultMark } from '@/components/ui/brand'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import { useWindows } from '@/store/window-provider'

const trayDate = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const appGradients: Record<string, string> = {
  vault: 'from-[#e0bd78] via-[#c2953f] to-[#8d6520]',
  mail: 'from-[#7fa9c7] via-[#4f7f9f] to-[#325b78]',
  messages: 'from-[#86b89a] via-[#4f8b6d] to-[#2f654d]',
  'file-explorer': 'from-[#e8c079] via-[#c99a45] to-[#9c7529]',
}

export function Taskbar({
  startOpen,
  notificationsOpen,
  calendarOpen,
  onToggleStart,
  onToggleNotifications,
  onToggleCalendar,
  onDismissFlyout,
}: {
  startOpen: boolean
  notificationsOpen: boolean
  calendarOpen: boolean
  onToggleStart: () => void
  onToggleNotifications: () => void
  onToggleCalendar: () => void
  onDismissFlyout: () => void
}) {
  const { windows, activateApp, showApp, minimizeAllApps } = useWindows()
  const { unreadCount } = useDemo()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const openWindows = new Map(windows.map((window) => [window.appId, window]))

  return (
    <footer
      className="acrylic absolute inset-x-0 bottom-0 z-50 flex h-14 items-center border-t border-white/[0.08] px-2 shadow-[0_-8px_30px_rgba(0,0,0,0.25)]"
      aria-label="Taskbar"
    >
      <div className="flex flex-1 items-center gap-2 pl-1.5">
        <span className="hidden items-center gap-2 text-white/45 lg:flex">
          <DVaultMark className="size-4 opacity-60 grayscale-[20%]" />
          <span className="text-[10px] font-medium uppercase tracking-[0.18em]">Demo session</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5" role="group" aria-label="Pinned and running apps">
        <button
          type="button"
          aria-label="Start"
          aria-expanded={startOpen}
          aria-haspopup="dialog"
          onClick={onToggleStart}
          className={cn(
            'group relative flex size-10 items-center justify-center rounded-md transition-colors',
            startOpen ? 'bg-white/15' : 'hover:bg-white/10',
          )}
        >
          <DVaultMark className="size-[22px]" />
        </button>

        <button
          type="button"
          aria-label="Search apps and records"
          aria-expanded={startOpen}
          onClick={onToggleStart}
          className="hidden h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-white/45 transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-white/70 sm:flex"
        >
          <Search className="size-3.5" />
          <span className="pr-2">Search</span>
        </button>

        <span className="mx-1 h-6 w-px bg-white/10" aria-hidden />

        {APP_ORDER.map((appId) => {
          const meta = APP_META[appId]
          const Icon = meta.icon
          const instance = openWindows.get(appId)
          const active = Boolean(instance && !instance.minimized)
          const running = Boolean(instance)
          return (
            <button
              key={appId}
              type="button"
              title={meta.title}
              aria-label={
                running ? `${meta.title} — ${active ? 'open' : 'minimised'}` : `Open ${meta.title}`
              }
              onClick={() => {
                onDismissFlyout()
                activateApp(appId)
              }}
              className={cn(
                'group relative flex size-10 items-center justify-center rounded-md transition-colors',
                active ? 'bg-white/[0.14]' : 'hover:bg-white/10',
              )}
            >
              <span
                className={cn(
                  'flex size-[26px] items-center justify-center rounded-[7px] bg-gradient-to-br shadow-[0_4px_10px_-4px_rgba(0,0,0,0.8)] ring-1 ring-white/15 transition-transform group-active:scale-95',
                  appGradients[appId],
                )}
              >
                <Icon className="size-4 text-white" strokeWidth={1.9} />
              </span>
              {running && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute bottom-1 left-1/2 h-[3px] -translate-x-1/2 rounded-full transition-all duration-200',
                    active ? 'w-4 bg-gold-bright' : 'w-1.5 bg-white/55',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-1 items-center justify-end gap-0.5 pr-1">
        <button
          type="button"
          title="Audit integrity verified"
          aria-label="Open DVault overview — audit integrity verified"
          onClick={() => {
            onDismissFlyout()
            showApp('vault', { section: 'overview' })
          }}
          className="flex h-9 w-8 items-center justify-center rounded-md text-gold-bright/90 transition-colors hover:bg-white/10 hover:text-gold-bright"
        >
          <ShieldCheck className="size-4" strokeWidth={1.8} />
        </button>
        <span
          className="flex h-9 w-8 items-center justify-center text-white/65"
          title="Network connected"
          aria-label="Network connected"
          role="img"
        >
          <Wifi className="size-4" strokeWidth={1.8} />
        </span>
        <span
          className="hidden h-9 w-8 items-center justify-center text-white/65 sm:flex"
          title="Volume 60%"
          aria-label="Volume 60 percent"
          role="img"
        >
          <Volume2 className="size-4" strokeWidth={1.8} />
        </span>

        <button
          type="button"
          aria-label="Open calendar"
          aria-expanded={calendarOpen}
          aria-haspopup="dialog"
          onClick={onToggleCalendar}
          className={cn(
            'ml-0.5 flex h-10 flex-col items-end justify-center rounded-md px-2 text-right leading-tight text-white/90 transition-colors',
            calendarOpen ? 'bg-white/15' : 'hover:bg-white/10',
          )}
        >
          <span className="text-[11.5px] font-medium tnum">{formatTime(now)}</span>
          <span className="text-[10px] text-white/60 tnum">{trayDate.format(now)}</span>
        </button>

        <button
          type="button"
          aria-label={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications, none unread'
          }
          aria-expanded={notificationsOpen}
          aria-haspopup="dialog"
          onClick={onToggleNotifications}
          className={cn(
            'relative flex size-9 items-center justify-center rounded-md text-white/80 transition-colors',
            notificationsOpen ? 'bg-white/15' : 'hover:bg-white/10',
          )}
        >
          <Bell className="size-4" strokeWidth={1.8} />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-semibold text-white ring-2 ring-[#1b1915]">
              {unreadCount}
            </span>
          )}
        </button>

        <button
          type="button"
          aria-label="Show desktop"
          title="Show desktop"
          onClick={() => {
            onDismissFlyout()
            minimizeAllApps()
          }}
          className="ml-1 h-9 w-1.5 shrink-0 rounded-full border border-white/10 bg-white/[0.06] transition-colors hover:bg-white/25"
        />
      </div>
    </footer>
  )
}
