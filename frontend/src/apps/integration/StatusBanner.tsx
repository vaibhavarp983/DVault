import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import type { IntegritySummary } from '@/domain/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'

export function StatusBanner({
  integrity,
  compact = false,
}: {
  integrity?: IntegritySummary | null
  compact?: boolean
}) {
  if (!integrity) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-line bg-panel-muted px-3 py-2 text-[10.5px] text-ink-soft">
        <ShieldQuestion className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
        <span>
          The workspace has not been connected to the evidence service. Start FastAPI and verify
          the chain in the Security Center.
        </span>
      </div>
    )
  }
  const failed = integrity.status === 'failed' || integrity.gateState === 'BLOCKED'
  const unverified = integrity.status === 'unverified'
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2',
        failed
          ? 'border-danger/30 bg-danger-soft text-[#8f2f2f]'
          : unverified
            ? 'border-warning/30 bg-warning-soft text-[#7d5c1c]'
            : 'border-success/25 bg-success-soft text-[#2f6b4f]',
      )}
      role={failed ? 'alert' : 'status'}
    >
      {failed ? (
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold">
            {failed ? 'Evidence integrity blocked' : unverified ? 'Evidence not verified' : 'Evidence verified'}
          </span>
          <Badge tone={failed ? 'danger' : unverified ? 'warning' : 'success'} className="capitalize">
            {integrity.status}
          </Badge>
          <Badge tone={failed ? 'danger' : 'neutral'}>Gate {integrity.gateState}</Badge>
        </div>
        {!compact && (
          <>
            <p className="mt-1 text-[10px] leading-4">
              {failed
                ? `Verification failed at sequence ${integrity.failureSequence ?? '?'} (${integrity.reasonCode ?? 'unknown reason'}). Managed dispatch and rights execution are blocked until review.`
                : `Trusted through sequence ${integrity.trustedThroughSequence ?? 0}. Checkpoint ${integrity.checkpointStatus ?? 'missing'}.`}
            </p>
            <p className="mt-1 text-[9.5px] leading-3.5 opacity-80">{integrity.disclaimer}</p>
          </>
        )}
      </div>
    </div>
  )
}
