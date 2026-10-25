import {
  Check,
  CheckCircle2,
  CircleAlert,
  Download,
  FileSearch,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { RightsRequestType } from '@/domain/types'
import type { UserRightsRequest, UserWorkspace } from '@/domain/user'
import { selectRequestCounts } from '@/data/user-selectors'
import {
  userRequestStatusLabel,
  userRequestStatusTone,
  userRequestTypeLabel,
} from '@/lib/user-meta'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useUser } from '@/store/user-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { PhoneAppShell } from './PhoneChrome'

const requestTypes: {
  type: RightsRequestType
  label: string
  description: string
  icon: LucideIcon
}[] = [
  {
    type: 'access',
    label: 'Access my data',
    description: 'Receive a copy of what is held.',
    icon: FileSearch,
  },
  {
    type: 'portability',
    label: 'Take my data elsewhere',
    description: 'Get a machine-readable export.',
    icon: Download,
  },
  {
    type: 'erasure',
    label: 'Erase my data',
    description: 'Delete data that is no longer needed.',
    icon: Trash2,
  },
  {
    type: 'rectification',
    label: 'Correct my data',
    description: 'Fix inaccurate personal details.',
    icon: Pencil,
  },
  {
    type: 'objection',
    label: 'Object to processing',
    description: 'Withdraw marketing consent.',
    icon: ShieldCheck,
  },
]

const statusOrder: Record<UserRightsRequest['status'], number> = {
  failed: 0,
  'in-progress': 1,
  open: 2,
  complete: 3,
}

export function PhoneRequestsApp({
  workspace,
  onBack,
}: {
  workspace: UserWorkspace
  onBack: () => void
}) {
  const { createRequest, retryRequest } = useUser()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<RightsRequestType>('access')
  const [submitting, setSubmitting] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [correctionField, setCorrectionField] = useState('email')
  const [correctionValue, setCorrectionValue] = useState('')
  const counts = selectRequestCounts(workspace)
  const requests = [...workspace.requests].sort((a, b) => {
    const order = statusOrder[a.status] - statusOrder[b.status]
    return order !== 0 ? order : a.dueAt.localeCompare(b.dueAt)
  })

  const needsCorrection = selectedType === 'rectification'
  const submit = async () => {
    setSubmitting(true)
    try {
      const ok = await createRequest(
        selectedType,
        needsCorrection
          ? {
              field: correctionField.trim(),
              requestedValue: correctionValue.trim(),
              reason: 'Personal portal correction',
            }
          : undefined,
      )
      if (ok) {
        setSheetOpen(false)
        setCorrectionValue('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const retry = async (request: UserRightsRequest) => {
    setRetryingId(request.id)
    try {
      await retryRequest(request.id)
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <PhoneAppShell
      title="Requests"
      onBack={onBack}
      action={
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="New rights request"
          className="flex size-8 items-center justify-center rounded-full bg-gold text-white transition-colors hover:bg-gold-ink"
        >
          <Plus className="size-4" />
        </button>
      }
      overlay={
        sheetOpen ? (
          <div className="absolute inset-0 z-40 flex flex-col justify-end">
            <button
              type="button"
              aria-label="Close new request"
              className="absolute inset-0 bg-charcoal/40 backdrop-blur-[1px]"
              onClick={() => setSheetOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="New rights request"
              className="scroll-thin relative max-h-[88%] overflow-y-auto rounded-t-[28px] border-t border-line bg-panel px-4 pb-7 pt-3 shadow-flyout"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-ink">What do you need?</p>
                  <p className="mt-1 text-[9px] leading-3.5 text-ink-faint">
                    Requests use the synthetic identity on this device.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setSheetOpen(false)}
                  className="flex size-7 items-center justify-center rounded-full text-ink-faint hover:bg-panel-muted"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              <div role="radiogroup" aria-label="Request type" className="mt-3 space-y-1.5">
                {requestTypes.map((option) => {
                  const Icon = option.icon
                  const selected = selectedType === option.type
                  return (
                    <button
                      key={option.type}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSelectedType(option.type)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
                        selected
                          ? 'border-gold/45 bg-gold-soft/40'
                          : 'border-line bg-surface',
                      )}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-gold-ink">
                        <Icon className="size-3" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10.5px] font-semibold text-ink">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[8.5px] text-ink-faint">
                          {option.description}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                          selected ? 'border-gold bg-gold text-white' : 'border-line-strong',
                        )}
                      >
                        {selected && <Check className="size-2.5" strokeWidth={3} />}
                      </span>
                    </button>
                  )
                })}
              </div>

              {needsCorrection && (
                <div className="mt-3 rounded-xl border border-line bg-surface p-2.5">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Correction details
                  </p>
                  <div className="mt-1.5 grid grid-cols-[96px_1fr] gap-1.5">
                    <input
                      value={correctionField}
                      onChange={(event) => setCorrectionField(event.target.value)}
                      aria-label="Field to correct"
                      className="rounded-md border border-line bg-panel px-2 py-1.5 text-[10px] text-ink"
                      placeholder="field"
                    />
                    <input
                      value={correctionValue}
                      onChange={(event) => setCorrectionValue(event.target.value)}
                      aria-label="Corrected value"
                      className="rounded-md border border-line bg-panel px-2 py-1.5 text-[10px] text-ink"
                      placeholder="new synthetic value"
                    />
                  </div>
                  <p className="mt-1 text-[8px] text-ink-faint">
                    The correction is applied to the synthetic source rows and recorded in the audit trail.
                  </p>
                </div>
              )}

              <Button
                variant="gold"
                size="sm"
                className="mt-4 w-full"
                disabled={submitting || (needsCorrection && !correctionValue.trim())}
                onClick={() => void submit()}
              >
                {submitting ? 'Submitting…' : 'Submit request'}
              </Button>
              <p className="mt-1.5 text-center text-[8px] text-ink-faint">
                Expected response within 30 days
              </p>
            </div>
          </div>
        ) : null
      }
    >
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="info">{counts.open} open</Badge>
          <Badge tone="gold">{counts['in-progress']} in progress</Badge>
          {counts.failed > 0 && <Badge tone="danger">{counts.failed} attention</Badge>}
          <Badge tone="success">{counts.complete} complete</Badge>
        </div>

        {requests.map((request) => {
          const completed = request.steps.filter((step) => step.status === 'complete').length
          const current = request.steps.find(
            (step) => step.status === 'failed' || step.status === 'in-progress',
          )
          const failedStep = request.steps.find((step) => step.status === 'failed')
          const overdue =
            new Date(request.dueAt).getTime() < Date.now() && request.status !== 'complete'
          return (
            <article
              key={request.id}
              className="rounded-2xl border border-line bg-panel p-3.5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[11px] font-semibold text-ink">{request.reference}</p>
                    <span className="text-[9px] text-ink-soft">
                      {userRequestTypeLabel[request.type]}
                    </span>
                    <Badge tone={userRequestStatusTone[request.status]}>
                      {userRequestStatusLabel[request.status]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[8.5px] text-ink-faint">
                    Due {formatDate(request.dueAt)}
                    {overdue && <span className="ml-1 font-medium text-danger">· overdue</span>}
                  </p>
                </div>
                <span className="shrink-0 text-[8.5px] text-ink-faint tnum">
                  {completed}/{request.steps.length}
                </span>
              </div>

              <Progress
                value={(completed / request.steps.length) * 100}
                tone={request.status === 'failed' ? 'danger' : request.status === 'complete' ? 'success' : 'gold'}
                className="mt-2.5 h-1"
                label={`${request.reference} progress`}
              />
              <p className="mt-1.5 text-[8.5px] text-ink-faint">
                {request.status === 'complete'
                  ? 'All steps complete'
                  : current
                    ? `Current: ${current.label}`
                    : 'Waiting to start'}
              </p>

              {failedStep?.detail && (
                <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft/60 px-2.5 py-2">
                  <CircleAlert className="mt-0.5 size-3 shrink-0 text-danger" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[8.5px] leading-3.5 text-ink-soft">{failedStep.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void retry(request)}
                    disabled={retryingId === request.id}
                    className="flex shrink-0 items-center gap-1 text-[8.5px] font-semibold text-gold-ink"
                  >
                    <RefreshCw
                      className={cn('size-2.5', retryingId === request.id && 'animate-spin')}
                    />
                    Retry
                  </button>
                </div>
              )}

              {request.resolution && (
                <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-success/20 bg-success-soft/60 px-2.5 py-2">
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-success" />
                  <p className="text-[8.5px] leading-3.5 text-ink-soft">{request.resolution}</p>
                </div>
              )}
            </article>
          )
        })}

        <p className="text-[8px] leading-3.5 text-ink-faint">{workspace.notice}</p>
      </div>
    </PhoneAppShell>
  )
}
