import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { formatTime } from '@/lib/format'

const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function CalendarFlyout({ open }: { open: boolean }) {
  const [view, setView] = useState(() => new Date())
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (open) {
      setView(new Date())
      setNow(new Date())
    }
  }, [open])

  if (!open) return null

  const year = view.getFullYear()
  const month = view.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startOffset = (firstOfMonth.getDay() + 6) % 7
  const days: Date[] = Array.from({ length: 42 }, (_, index) => {
    return new Date(year, month, index - startOffset + 1)
  })
  const today = new Date()

  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(firstOfMonth)

  return (
    <div
      role="dialog"
      aria-label="Calendar"
      className="acrylic-strong animate-flyout-in absolute bottom-[68px] right-3 z-[60] w-[324px] overflow-hidden rounded-xl border border-white/[0.12] text-white shadow-flyout"
    >
      <header className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div>
          <p className="text-[12.5px] font-semibold">{monthLabel}</p>
          <p className="mt-0.5 text-[10px] text-white/40">
            {formatTime(now)} · local demo time
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setView(new Date(year, month - 1, 1))}
            className="flex size-7 items-center justify-center rounded text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setView(new Date(year, month + 1, 1))}
            className="flex size-7 items-center justify-center rounded text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </header>

      <div className="px-3 pb-2 pt-3">
        <div className="grid grid-cols-7 gap-0.5 px-1 pb-1">
          {weekdays.map((day) => (
            <span
              key={day}
              className="flex h-6 items-center justify-center text-[9.5px] font-medium uppercase tracking-wide text-white/30"
            >
              {day}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day) => {
            const inMonth = day.getMonth() === month
            const isToday = sameDay(day, today)
            return (
              <span
                key={day.toISOString()}
                className={cn(
                  'flex h-8 items-center justify-center rounded-full text-[11px] tnum',
                  inMonth ? 'text-white/80' : 'text-white/20',
                  isToday && 'bg-gold font-semibold text-white shadow-[0_2px_10px_rgba(183,137,47,0.45)]',
                )}
              >
                {day.getDate()}
              </span>
            )
          })}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-2.5">
        <p className="text-[10px] text-white/35">No reviews scheduled today</p>
        <button
          type="button"
          onClick={() => setView(new Date())}
          className="rounded px-2 py-1 text-[10px] font-medium text-gold-bright transition-colors hover:bg-white/10"
        >
          Today
        </button>
      </footer>
    </div>
  )
}
