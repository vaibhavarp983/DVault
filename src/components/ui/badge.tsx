import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info' | 'outline'

const tones: Record<Tone, string> = {
  neutral: 'border-line bg-panel-muted text-ink-soft',
  gold: 'border-gold/25 bg-gold-soft text-gold-ink',
  success: 'border-success/20 bg-success-soft text-success',
  warning: 'border-warning/20 bg-warning-soft text-warning',
  danger: 'border-danger/20 bg-danger-soft text-danger',
  info: 'border-info/20 bg-info-soft text-info',
  outline: 'border-line-strong bg-transparent text-ink-soft',
}

const dots: Record<Tone, string> = {
  neutral: 'bg-ink-faint',
  gold: 'bg-gold',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  outline: 'bg-ink-faint',
}

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: ReactNode
  tone?: Tone
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', dots[tone])} aria-hidden />}
      {children}
    </span>
  )
}

export type BadgeTone = Tone
