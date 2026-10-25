import { cn } from '@/lib/cn'

export function DVaultMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('size-8', className)} aria-hidden>
      <defs>
        <linearGradient id="dvault-mark" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E3C079" />
          <stop offset="0.52" stopColor="#C0943E" />
          <stop offset="1" stopColor="#8E6822" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#dvault-mark)" />
      <rect x="2.75" y="2.75" width="42.5" height="42.5" rx="11.25" fill="none" stroke="#FFF8E7" strokeOpacity="0.28" strokeWidth="1.5" />
      <path
        d="M13.5 15.5 24 34l10.5-18.5"
        fill="none"
        stroke="#241C0C"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="15.5" r="2.6" fill="#FFF6E1" />
    </svg>
  )
}

export function Wordmark({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <DVaultMark className="size-7" />
      <span className="leading-none">
        <span className="block text-[13px] font-semibold tracking-tight text-ink">DVault</span>
        {subtitle && (
          <span className="mt-0.5 block text-[9px] uppercase tracking-[0.16em] text-ink-faint">
            {subtitle}
          </span>
        )}
      </span>
    </span>
  )
}
