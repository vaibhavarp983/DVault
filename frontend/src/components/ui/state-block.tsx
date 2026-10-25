import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-line/80', className)}
      aria-hidden
    />
  )
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-2.5 w-2/5" />
            <Skeleton className="h-2 w-3/5" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function StateBlock({
  title,
  description,
  icon: Icon,
  tone = 'empty',
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  tone?: 'empty' | 'error' | 'loading'
  children?: ReactNode
  className?: string
}) {
  const Fallback = tone === 'error' ? AlertTriangle : Inbox
  const Display = Icon ?? Fallback
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-xl border',
          tone === 'error'
            ? 'border-danger/20 bg-danger-soft text-danger'
            : 'border-line bg-panel-muted text-ink-faint',
        )}
      >
        <Display className="size-5" strokeWidth={1.75} />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        {description && <p className="text-xs leading-5 text-ink-faint">{description}</p>}
      </div>
      {children}
    </div>
  )
}
