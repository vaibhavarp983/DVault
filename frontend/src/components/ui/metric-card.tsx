import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type MetricTone = 'gold' | 'success' | 'warning' | 'info' | 'neutral' | 'danger'

const tones: Record<MetricTone, { icon: string; glow: string }> = {
  gold: { icon: 'bg-gold-soft text-gold-ink', glow: 'from-gold/[0.07]' },
  success: { icon: 'bg-success-soft text-success', glow: 'from-success/[0.06]' },
  warning: { icon: 'bg-warning-soft text-warning', glow: 'from-warning/[0.07]' },
  info: { icon: 'bg-info-soft text-info', glow: 'from-info/[0.06]' },
  neutral: { icon: 'bg-panel-muted text-ink-soft', glow: 'from-ink/[0.04]' },
  danger: { icon: 'bg-danger-soft text-danger', glow: 'from-danger/[0.06]' },
}

export function MetricCard({
  label,
  value,
  suffix,
  hint,
  icon: Icon,
  tone = 'neutral',
  foot,
}: {
  label: string
  value: ReactNode
  suffix?: string
  hint?: string
  icon: LucideIcon
  tone?: MetricTone
  foot?: ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-panel p-4 shadow-panel">
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b to-transparent',
          tones[tone].glow,
        )}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">{label}</p>
          <p className="mt-2 flex items-baseline gap-1 text-[26px] font-semibold leading-none tracking-tight text-ink tnum">
            {value}
            {suffix && <span className="text-xs font-medium text-ink-faint">{suffix}</span>}
          </p>
        </div>
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            tones[tone].icon,
          )}
        >
          <Icon className="size-4" strokeWidth={1.9} />
        </span>
      </div>
      {(hint || foot) && (
        <div className="relative mt-3 flex items-center justify-between gap-2 border-t border-line/70 pt-2.5">
          {hint && <p className="truncate text-[11px] text-ink-faint">{hint}</p>}
          {foot}
        </div>
      )}
    </div>
  )
}
