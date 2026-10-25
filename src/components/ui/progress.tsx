import { cn } from '@/lib/cn'

type ProgressTone = 'gold' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const fills: Record<ProgressTone, string> = {
  gold: 'bg-gold',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-ink-faint',
}

export function Progress({
  value,
  tone = 'gold',
  className,
  label,
}: {
  value: number
  tone?: ProgressTone
  className?: string
  label?: string
}) {
  const bounded = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(bounded)}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', fills[tone])}
        style={{ width: `${bounded}%` }}
      />
    </div>
  )
}
