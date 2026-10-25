import { cn } from '@/lib/cn'

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150',
        checked
          ? 'border-gold/40 bg-gold'
          : 'border-line-strong bg-panel-muted',
        disabled && 'cursor-not-allowed opacity-45',
      )}
    >
      <span
        className={cn(
          'block size-3.5 rounded-full bg-white shadow-sm transition-transform duration-150',
          checked ? 'translate-x-[17px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}
