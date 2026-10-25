import { History } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { UserActivityCategory, UserWorkspace } from '@/domain/user'
import { userActivityTone } from '@/lib/user-meta'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { PhoneAppShell } from './PhoneChrome'

type Filter = 'all' | UserActivityCategory

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'consent', label: 'Consent' },
  { value: 'access', label: 'Access' },
  { value: 'request', label: 'Requests' },
  { value: 'system', label: 'System' },
]

const severityDot = {
  info: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-danger',
} as const

const categoryLabel: Record<UserActivityCategory, string> = {
  consent: 'Consent',
  access: 'Access',
  request: 'Request',
  system: 'System',
}

export function PhoneActivityApp({
  workspace,
  onBack,
}: {
  workspace: UserWorkspace
  onBack: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      all: workspace.activity.length,
      consent: 0,
      access: 0,
      request: 0,
      system: 0,
    }
    for (const event of workspace.activity) result[event.category] += 1
    return result
  }, [workspace.activity])

  const events = useMemo(() => {
    const sorted = [...workspace.activity].sort((a, b) => b.at.localeCompare(a.at))
    return filter === 'all' ? sorted : sorted.filter((event) => event.category === filter)
  }, [workspace.activity, filter])

  return (
    <PhoneAppShell
      title="Activity"
      onBack={onBack}
      action={<span className="text-[9px] text-ink-faint tnum">{workspace.activity.length}</span>}
    >
      <div className="space-y-3 p-4">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] transition-colors',
                filter === option.value
                  ? 'border-gold/40 bg-gold-soft text-gold-ink'
                  : 'border-line bg-panel text-ink-soft',
              )}
            >
              {option.label}
              <span className="text-ink-faint tnum">{counts[option.value]}</span>
            </button>
          ))}
        </div>

        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-panel px-4 py-8 text-center">
            <History className="mx-auto size-5 text-ink-faint" />
            <p className="mt-2 text-[10.5px] font-medium text-ink">No events in this category</p>
          </div>
        ) : (
          <ol className="relative">
            {events.map((event, index) => (
              <li key={event.id} className="relative flex gap-2.5 pb-3 last:pb-0">
                {index < events.length - 1 && (
                  <span className="absolute left-[5px] top-4 h-full w-px bg-line" aria-hidden />
                )}
                <span
                  className={cn(
                    'relative mt-1 size-2.5 shrink-0 rounded-full border-2 border-canvas',
                    severityDot[event.severity],
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-2.5 py-2">
                  <div className="flex items-start gap-1.5">
                    <p className="min-w-0 flex-1 text-[9.5px] font-medium leading-3.5 text-ink">
                      {event.action}
                    </p>
                    <Badge tone={userActivityTone[event.category]}>
                      {categoryLabel[event.category]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[8px] text-ink-faint">
                    {event.actor} · {formatDateTime(event.at)}
                  </p>
                  <p className="mt-0.5 text-[8px] text-ink-faint/80">{formatRelative(event.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="text-[8px] leading-3.5 text-ink-faint">{workspace.notice}</p>
      </div>
    </PhoneAppShell>
  )
}
