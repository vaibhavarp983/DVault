import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  flush?: boolean
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col rounded-xl border border-line bg-panel shadow-panel',
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line/80 px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[13px] font-semibold text-ink">{title}</h2>}
            {description && (
              <p className="mt-0.5 truncate text-[11px] leading-4 text-ink-faint">{description}</p>
            )}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', !flush && 'p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint',
        className,
      )}
    >
      {children}
    </p>
  )
}
