import {
  BarChart3,
  FlaskConical,
  LockKeyhole,
  Megaphone,
  Rocket,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { ConsentPurpose, UserWorkspace } from '@/domain/user'
import { selectConsentHealth } from '@/data/user-selectors'
import { consentStateLabel } from '@/lib/user-meta'
import { formatDateTime } from '@/lib/format'
import { useUser } from '@/store/user-provider'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Toggle } from '@/components/ui/toggle'
import { PhoneAppShell } from './PhoneChrome'

const icons: Record<string, LucideIcon> = {
  'ucns-marketing': Megaphone,
  'ucns-product': Rocket,
  'ucns-analytics': BarChart3,
  'ucns-service': ShieldCheck,
  'ucns-research': FlaskConical,
}

export function PhoneConsentApp({
  workspace,
  onBack,
}: {
  workspace: UserWorkspace
  onBack: () => void
}) {
  const { setConsent, withdraw } = useUser()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [tier, setTier] = useState<string>(workspace.withdrawalTiers?.[0]?.key ?? 'marketing-only')
  const [applying, setApplying] = useState(false)
  const selectedTier = workspace.withdrawalTiers?.find((entry) => entry.key === tier)
  const health = selectConsentHealth(workspace)
  const optional = workspace.consents.filter((consent) => !consent.required)
  const required = workspace.consents.find((consent) => consent.required)

  const update = async (consent: ConsentPurpose, granted: boolean) => {
    setPendingId(consent.id)
    try {
      await setConsent(consent.id, granted)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <PhoneAppShell
      title="Consent"
      onBack={onBack}
      action={<Badge tone="gold">{health.percent}%</Badge>}
    >
      <div className="space-y-3 p-4">
        <div className="rounded-2xl border border-line bg-panel p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Consent health
              </p>
              <p className="mt-1 text-[22px] font-semibold leading-none text-ink tnum">
                {health.active}
                <span className="text-[11px] font-normal text-ink-faint">/{health.total}</span>
              </p>
            </div>
            <ShieldCheck className="size-6 text-gold/50" strokeWidth={1.5} />
          </div>
          <Progress value={health.percent} tone="gold" className="mt-2.5 h-1.5" label="Consent health" />
          <p className="mt-2 text-[8.5px] leading-3.5 text-ink-faint">
            Optional consents are active. Required service messages stay on.
          </p>
        </div>

        {optional.map((consent) => {
          const Icon = icons[consent.id] ?? ShieldCheck
          const pending = pendingId === consent.id
          return (
            <div
              key={consent.id}
              className="rounded-2xl border border-line bg-panel p-3.5 shadow-sm"
            >
              <div className="flex items-start gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft">
                  <Icon className="size-3.5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10.5px] font-semibold text-ink">{consent.purpose}</p>
                    <Badge tone={consent.granted ? 'success' : 'neutral'}>
                      {consentStateLabel(consent)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[9px] leading-3.5 text-ink-soft">
                    {consent.description}
                  </p>
                </div>
                <Toggle
                  checked={consent.granted}
                  disabled={pending}
                  onChange={(next) => void update(consent, next)}
                  label={`${consent.granted ? 'Withdraw' : 'Grant'} ${consent.purpose}`}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-line pt-2 text-[8px] text-ink-faint">
                <span>Updated {formatDateTime(consent.updatedAt)}</span>
                <span>via {consent.channel}</span>
                {pending && <span className="text-gold-ink">Saving…</span>}
              </div>
            </div>
          )
        })}

        {required && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-gold/20 bg-gold-soft/40 p-3.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/20 bg-gold-soft text-gold-ink">
              <LockKeyhole className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-[10.5px] font-semibold text-ink">{required.purpose}</p>
                <Badge tone="gold">Required</Badge>
              </div>
              <p className="mt-1 text-[9px] leading-3.5 text-ink-soft">{required.description}</p>
            </div>
            <Toggle checked disabled onChange={() => undefined} label="Required consent" />
          </div>
        )}

        <div className="rounded-2xl border border-line bg-panel p-3.5 shadow-sm">
          <div className="flex items-center gap-1.5">
            <Megaphone className="size-3.5 text-gold-ink" />
            <p className="text-[10.5px] font-semibold text-ink">Withdraw by tier</p>
          </div>
          <p className="mt-1 text-[8.5px] leading-3.5 text-ink-faint">
            Choose one action. Service messages always stay on.
          </p>
          <div className="mt-2 space-y-1.5">
            {(workspace.withdrawalTiers ?? []).map((entry) => (
              <button
                key={entry.key}
                type="button"
                disabled={!entry.active}
                onClick={() => setTier(entry.key)}
                className={`flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                  tier === entry.key
                    ? 'border-gold/50 bg-gold-soft/50'
                    : 'border-line bg-surface'
                } disabled:opacity-40`}
              >
                <span
                  className={`mt-1 size-2.5 shrink-0 rounded-full border ${
                    tier === entry.key ? 'border-gold bg-gold' : 'border-line-strong'
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-[9.5px] font-semibold text-ink">{entry.label}</span>
                  <span className="mt-0.5 block text-[8px] leading-3.5 text-ink-faint">
                    {entry.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {selectedTier && (
            <p className="mt-2 rounded-lg border border-gold/20 bg-gold-soft/40 px-2 py-1.5 text-[8px] leading-3.5 text-gold-ink">
              Effect: {selectedTier.effect}. High-interaction threads always keep full content.
            </p>
          )}
          <button
            type="button"
            disabled={!selectedTier?.active || applying}
            onClick={async () => {
              setApplying(true)
              try {
                await withdraw(tier)
              } finally {
                setApplying(false)
              }
            }}
            className="mt-2.5 h-8 w-full rounded-lg bg-gold text-[10px] font-semibold text-white disabled:opacity-40"
          >
            {applying ? 'Applying withdrawal…' : 'Apply withdrawal'}
          </button>
          <p className="mt-1.5 text-[7.5px] text-ink-faint">
            Withdrawal re-runs retention for this synthetic identity.
          </p>
        </div>

        <p className="text-[8px] leading-3.5 text-ink-faint">{workspace.notice}</p>
      </div>
    </PhoneAppShell>
  )
}
