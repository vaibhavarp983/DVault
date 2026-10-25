import {
  BatteryFull,
  ChevronLeft,
  LockKeyhole,
  Signal,
  Wifi,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { AppNotification } from '@/domain/types'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { DVaultMark } from '@/components/ui/brand'
import { Button } from '@/components/ui/button'
import { Skeleton, StateBlock } from '@/components/ui/state-block'

const lockDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export function StatusBar({ dark, now }: { dark: boolean; now: Date }) {
  return (
    <div
      className={cn(
        'absolute inset-x-0 top-0 z-30 flex h-[38px] items-center justify-between px-6 pt-[3px]',
        dark ? 'text-ink' : 'text-white',
      )}
    >
      <span className="w-14 text-[10.5px] font-semibold tnum">{formatTime(now)}</span>
      <span className="flex items-center gap-1.5 opacity-90">
        <Signal className="size-3.5" strokeWidth={2.2} />
        <Wifi className="size-3.5" strokeWidth={2.2} />
        <BatteryFull className="size-4" strokeWidth={2.2} />
      </span>
    </div>
  )
}

export function PhoneFrame({
  locked,
  onToggleLock,
  indicatorDark,
  children,
}: {
  locked: boolean
  onToggleLock: () => void
  indicatorDark: boolean
  children: ReactNode
}) {
  return (
    <div className="relative h-[min(820px,calc(100dvh-150px))] min-h-[560px] aspect-[390/844]">
      <div className="absolute inset-0 rounded-[3.2rem] border-[9px] border-[#171411] bg-[#0c0b09] shadow-[0_55px_90px_-35px_rgba(15,13,10,0.75)] ring-1 ring-white/10">
        <div className="absolute inset-0 overflow-hidden rounded-[2.55rem] bg-canvas">
          {children}
        </div>
        <div
          className="pointer-events-none absolute left-1/2 top-[9px] z-50 h-[23px] w-[100px] -translate-x-1/2 rounded-full bg-black"
          aria-hidden
        />
        <div
          className={cn(
            'pointer-events-none absolute bottom-[7px] left-1/2 z-50 h-[4px] w-[116px] -translate-x-1/2 rounded-full',
            indicatorDark ? 'bg-ink/30' : 'bg-white/55',
          )}
          aria-hidden
        />
      </div>

      <div
        className="absolute -left-[5px] top-[142px] h-8 w-[5px] rounded-l-md bg-[#2b2721]"
        aria-hidden
      />
      <div
        className="absolute -left-[5px] top-[188px] h-12 w-[5px] rounded-l-md bg-[#2b2721]"
        aria-hidden
      />
      <button
        type="button"
        onClick={onToggleLock}
        aria-label={locked ? 'Unlock phone screen' : 'Lock phone screen'}
        title={locked ? 'Unlock' : 'Lock'}
        className="absolute -right-[6px] top-[164px] h-16 w-[6px] rounded-r-md bg-[#2b2721] transition-colors hover:bg-[#4a4439]"
      />
    </div>
  )
}

export function PhoneAppShell({
  title,
  onBack,
  action,
  children,
  overlay,
}: {
  title: string
  onBack: () => void
  action?: ReactNode
  children: ReactNode
  overlay?: ReactNode
}) {
  return (
    <div className="relative flex h-full flex-col bg-canvas pt-[38px]">
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line/80 bg-canvas/95 px-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to home screen"
          className="flex size-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-panel-muted hover:text-ink"
        >
          <ChevronLeft className="size-4.5" strokeWidth={2} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{title}</h1>
        {action}
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
      {overlay}
    </div>
  )
}

const noticeTone = {
  info: 'border-info/20 bg-info-soft text-info',
  success: 'border-success/20 bg-success-soft text-success',
  warning: 'border-warning/20 bg-warning-soft text-warning',
  danger: 'border-danger/20 bg-danger-soft text-danger',
} as const

export function PhoneNotice({
  notification,
  onDismiss,
  belowHeader = false,
}: {
  notification: AppNotification
  onDismiss: () => void
  belowHeader?: boolean
}) {
  return (
    <div
      role="status"
      className={cn(
        'animate-flyout-in absolute inset-x-3 z-40 flex items-start gap-2.5 rounded-2xl border border-line bg-panel/95 px-3 py-2.5 shadow-flyout backdrop-blur',
        belowHeader ? 'top-[92px]' : 'top-[46px]',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border',
          noticeTone[notification.tone],
        )}
      >
        <span className="size-1.5 rounded-full bg-current" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10.5px] font-semibold text-ink">{notification.title}</p>
        <p className="mt-0.5 line-clamp-2 text-[9.5px] leading-4 text-ink-soft">
          {notification.body}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-panel-muted"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

export function PhoneLockScreen({
  now,
  onUnlock,
  consentPercent,
  openRequests,
}: {
  now: Date
  onUnlock: () => void
  consentPercent: number
  openRequests: number
}) {
  return (
    <div className="relative h-full overflow-hidden text-white">
      <div className="wallpaper absolute inset-0" />
      <div className="relative flex h-full flex-col px-7 pb-10 pt-[76px]">
        <div className="text-center">
          <p className="text-[10.5px] font-medium text-white/60">DVault Personal</p>
          <p className="mt-3 text-[54px] font-light leading-none tracking-[-0.04em] text-white tnum">
            {formatTime(now)}
          </p>
          <p className="mt-2 text-[11px] text-white/55">{lockDate.format(now)}</p>
        </div>

        <div className="mt-10 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-4 text-gold-bright" />
            <p className="text-[11px] font-medium text-white/85">Your privacy snapshot</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[20px] font-semibold leading-none text-white tnum">
                {consentPercent}%
              </p>
              <p className="mt-1 text-[9px] text-white/45">consent health</p>
            </div>
            <div>
              <p className="text-[20px] font-semibold leading-none text-white tnum">
                {openRequests}
              </p>
              <p className="mt-1 text-[9px] text-white/45">open requests</p>
            </div>
          </div>
          <p className="mt-3 text-[9px] leading-4 text-white/35">
            Tap unlock to explore your synthetic personal data. No passcode is used in this demo.
          </p>
        </div>

        <div className="mt-auto">
          <Button variant="gold" className="w-full" onClick={onUnlock}>
            Unlock demo phone
          </Button>
          <p className="mt-3 text-center text-[8.5px] uppercase tracking-[0.16em] text-white/25">
            Synthetic device · local session
          </p>
        </div>
      </div>
    </div>
  )
}

export function PhoneSplash() {
  return (
    <div className="flex h-full flex-col bg-canvas pt-[38px]">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <DVaultMark className="size-10" />
        <div className="text-center">
          <p className="text-[13px] font-semibold text-ink">Opening your privacy workspace</p>
          <p className="mt-1 text-[10px] text-ink-faint">Loading the synthetic personal data…</p>
        </div>
        <div className="w-44 space-y-2">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-3/4" />
        </div>
      </div>
    </div>
  )
}

export function PhoneError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col bg-canvas pt-[38px]">
      <div className="flex flex-1 items-center justify-center px-5">
        <StateBlock
          tone="error"
          title="Could not load your data"
          description={message}
        >
          <Button variant="gold" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </StateBlock>
      </div>
    </div>
  )
}
