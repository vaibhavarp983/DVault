import { Link } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import { DVaultMark } from '@/components/ui/brand'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl border border-line bg-panel text-gold-ink shadow-panel">
        <Compass className="size-6" />
      </span>
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-ink">
        404
      </p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-ink">
        This page is outside the workspace
      </h1>
      <p className="mt-2 max-w-md text-[12px] leading-5 text-ink-soft">
        The address you followed does not match a DVault portal. Choose where you want to go.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[11.5px] font-medium text-canvas transition-colors hover:bg-charcoal-soft"
        >
          <ArrowLeft className="size-3.5" /> Workspace chooser
        </Link>
        <Link
          to="/user"
          className="rounded-md border border-line-strong px-4 py-2 text-[11.5px] font-medium text-ink-soft transition-colors hover:border-gold/40 hover:text-ink"
        >
          Personal phone
        </Link>
        <Link
          to="/business"
          className="rounded-md border border-line-strong px-4 py-2 text-[11.5px] font-medium text-ink-soft transition-colors hover:border-gold/40 hover:text-ink"
        >
          Business desktop
        </Link>
      </div>
      <div className="mt-10 flex items-center gap-2 text-[10px] text-ink-faint">
        <DVaultMark className="size-4" /> DVault · synthetic demo
      </div>
    </div>
  )
}
