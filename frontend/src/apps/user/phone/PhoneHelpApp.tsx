import { ClipboardList, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PhoneAppShell } from './PhoneChrome'
import type { PhoneApp } from './types'

export function PhoneHelpApp({
  onBack,
  onOpenApp,
}: {
  onBack: () => void
  onOpenApp: (app: PhoneApp) => void
}) {
  return (
    <PhoneAppShell title="Help & privacy" onBack={onBack}>
      <div className="space-y-3 p-4">
        <div className="rounded-2xl border border-gold/20 bg-gold-soft/40 p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-gold-ink">
            <Sparkles className="size-3" /> About this simulator
          </p>
          <p className="mt-1.5 text-[9px] leading-4 text-ink-soft">
            This is a synthetic smartphone simulator. DVault is showing one fictional identity so
            you can explore consent and data-rights flows without real personal data.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-ink">
            <ShieldCheck className="size-3.5 text-gold" /> Your rights
          </p>
          <ul className="mt-2 space-y-2 text-[9px] leading-4 text-ink-soft">
            <li>
              <span className="font-semibold text-ink">Access</span> — ask for a copy of the
              personal data held about you.
            </li>
            <li>
              <span className="font-semibold text-ink">Portability</span> — receive a
              machine-readable export.
            </li>
            <li>
              <span className="font-semibold text-ink">Erasure</span> — ask for data that is no
              longer required to be deleted.
            </li>
            <li>
              <span className="font-semibold text-ink">Rectification</span> — ask for inaccurate
              details to be corrected.
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-ink">
            <ClipboardList className="size-3.5 text-gold" /> Requests take up to 30 days
          </p>
          <p className="mt-1.5 text-[9px] leading-4 text-ink-soft">
            Every request is tracked step by step. If a source fails to respond, the request stays
            open and can be retried without losing completed work.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenApp('consent')}>
            Review consent
          </Button>
          <Button variant="gold" size="sm" onClick={() => onOpenApp('requests')}>
            View requests
          </Button>
        </div>

        <p className="text-center text-[8px] leading-3.5 text-ink-faint">
          Questions? This demo has no live support channel. No real personal data is processed.
        </p>
      </div>
    </PhoneAppShell>
  )
}
