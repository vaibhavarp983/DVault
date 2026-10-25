import type { ContactMode } from '@/data/config'
import { cn } from '@/lib/cn'

export function ContactModeToggle({
  mode,
  available,
  onChange,
}: {
  mode: ContactMode
  available: boolean
  onChange: (mode: ContactMode) => void
}) {
  return (
    <div
      className="inline-flex items-center rounded-md border border-line bg-surface p-0.5"
      role="group"
      aria-label="Contact display mode"
    >
      {(['masked', 'synthetic'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          disabled={value === 'synthetic' && !available}
          onClick={() => onChange(value)}
          className={cn(
            'rounded px-2 py-1 text-[9.5px] font-medium capitalize transition-colors',
            mode === value
              ? 'bg-gold-soft text-gold-ink'
              : 'text-ink-faint hover:text-ink-soft disabled:cursor-not-allowed disabled:opacity-40',
          )}
          title={
            value === 'synthetic' && !available
              ? 'Synthetic contact display is disabled on this deployment'
              : undefined
          }
        >
          {value}
        </button>
      ))}
    </div>
  )
}
