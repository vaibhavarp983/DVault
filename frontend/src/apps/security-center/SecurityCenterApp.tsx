import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { BreachIncident } from '@/domain/types'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Panel } from '@/components/ui/panel'
import { Skeleton, StateBlock } from '@/components/ui/state-block'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import { ContactModeToggle } from '@/apps/integration/ContactModeToggle'
import { StatusBanner } from '@/apps/integration/StatusBanner'

const severityTone: Record<string, BadgeTone> = {
  LOW: 'neutral',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
}

const timerTone: Record<string, BadgeTone> = {
  ON_TRACK: 'success',
  DUE_SOON: 'warning',
  OVERDUE: 'danger',
  COMPLETE: 'neutral',
}

export function SecurityCenterApp() {
  const {
    data,
    status,
    error,
    refresh,
    refreshing,
    mode,
    contactMode,
    setContactMode,
    demoControlsEnabled,
    verifyAudit,
    createCheckpoint,
    resolveIncident,
    createBreach,
    assessBreach,
    draftBreachNotification,
    closeBreach,
    injectFailure,
    clearFailures,
    resetDemo,
  } = useDemo()
  const [pending, setPending] = useState<string | null>(null)
  const [decision, setDecision] = useState<'ACKNOWLEDGE_EXCEPTION' | 'RESTORE_VERIFIED'>(
    'ACKNOWLEDGE_EXCEPTION',
  )
  const [note, setNote] = useState('Reviewed the synthetic evidence failure.')
  const [breachTitle, setBreachTitle] = useState('Synthetic wrong-group message')
  const [breachDescription, setBreachDescription] = useState(
    'A synthetic campaign message reached the wrong recipient group.',
  )
  const [breachSeverity, setBreachSeverity] = useState('HIGH')
  const [breachSubject, setBreachSubject] = useState('')
  const [closeNote, setCloseNote] = useState('Containment complete; draft reviewed by the demo operator.')
  const [failureSourceId, setFailureSourceId] = useState('')
  const [confirm, setConfirm] = useState<'reset' | 'tamper' | null>(null)

  const incidents = data?.integrity?.incidents ?? []
  const breaches = data?.breaches ?? []
  const recentEvents = useMemo(
    () => (data?.auditEvents ?? []).slice(-80).reverse(),
    [data],
  )

  if (status === 'loading' || !data) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-auto p-5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="p-6">
        <StateBlock tone="error" title="Security Center unavailable" description={error ?? 'The workspace could not be loaded.'}>
          <Button variant="gold" onClick={() => void refresh()}>
            Retry
          </Button>
        </StateBlock>
      </div>
    )
  }

  const integrity = data.integrity
  const blocked = integrity?.gateState === 'BLOCKED'
  const controlsVisible =
    mode === 'api' &&
    demoControlsEnabled &&
    (data.demo?.failureInjectionEnabled || data.demo?.resetAvailable)

  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key)
    try {
      await action()
    } finally {
      setPending(null)
    }
  }

  const createBreaches = async () => {
    if (mode !== 'api') return
    const subjectRef = breachSubject || data.demo?.userSubjectRef || data.customers[0]?.id
    await run('breach', () =>
      createBreach({
        title: breachTitle,
        description: breachDescription,
        severity: breachSeverity,
        subjectRefs: subjectRef ? [subjectRef] : [],
        containmentSummary: 'Synthetic containment rehearsal.',
      }),
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-gold-soft text-gold-ink">
          <ShieldCheck className="size-4" strokeWidth={1.8} />
        </span>
        <div>
          <h1 className="text-[12.5px] font-semibold text-ink">Security Center</h1>
          <p className="text-[9.5px] text-ink-faint">
            Evidence consistency, fail-closed controls, and breach readiness.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ContactModeToggle
            mode={contactMode}
            available={Boolean(data.demo?.syntheticContactsAvailable)}
            onChange={(value) => void setContactMode(value)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={mode !== 'api' || pending !== null}
            onClick={() => void run('verify', verifyAudit)}
          >
            <Fingerprint className={cn('size-3.5', pending === 'verify' && 'animate-pulse')} />
            Verify chain
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={mode !== 'api' || pending !== null || blocked}
            onClick={() => void run('checkpoint', () => createCheckpoint('Signed from Security Center.'))}
          >
            Sign checkpoint
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <StatusBanner integrity={integrity} />

          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {[
              ['Status', integrity?.status ?? 'unverified'],
              ['Trusted through', String(integrity?.trustedThroughSequence ?? 0)],
              ['Checkpoint', integrity?.checkpointStatus ?? 'missing'],
              ['Open incidents', String(incidents.filter((incident) => incident.status === 'OPEN').length)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-line bg-panel px-3 py-2">
                <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</p>
                <p className="mt-1 text-[13px] font-semibold capitalize text-ink tnum">{value}</p>
              </div>
            ))}
          </div>

          {blocked && (
            <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[#8f2f2f]">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                <ShieldAlert className="size-4" />
                Fail-closed gate is active
              </div>
              <p className="mt-1 text-[10px] leading-4">
                Managed dispatch and rights execution/retry return 409 EVIDENCE_UNTRUSTED. Reads,
                previews, and review remain available.
              </p>
            </div>
          )}

          <Panel title="Integrity incidents" description="Every decision is audited with a reviewer note." flush>
            {incidents.length === 0 ? (
              <div className="p-6">
                <StateBlock title="No integrity incidents" description="Run a verification to confirm the chain." />
              </div>
            ) : (
              <div className="divide-y divide-line/70">
                {incidents.map((incident) => (
                  <div key={incident.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={incident.status === 'OPEN' ? 'danger' : incident.status === 'ACKNOWLEDGED' ? 'warning' : 'success'}>
                        {incident.status}
                      </Badge>
                      <span className="font-mono text-[9.5px] text-ink-faint">
                        seq {incident.firstFailureSequence}
                      </span>
                      <span className="text-[10px] font-semibold text-ink">{incident.reasonCode}</span>
                      <span className="ml-auto text-[9px] text-ink-faint">
                        {formatRelative(incident.detectedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[9.5px] text-ink-soft">{incident.reasonMessage}</p>
                    {incident.status !== 'RESOLVED' && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <select
                          value={decision}
                          onChange={(event) =>
                            setDecision(event.target.value as 'ACKNOWLEDGE_EXCEPTION' | 'RESTORE_VERIFIED')
                          }
                          className="rounded-md border border-line bg-surface px-2 py-1 text-[9.5px] text-ink"
                        >
                          <option value="ACKNOWLEDGE_EXCEPTION">Acknowledge exception</option>
                          <option value="RESTORE_VERIFIED">Restore verified</option>
                        </select>
                        <input
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          className="min-w-[180px] flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[9.5px] text-ink"
                          placeholder="Reviewer note (min 8 characters)"
                        />
                        <Button
                          variant="gold"
                          size="sm"
                          disabled={mode !== 'api' || pending !== null || note.trim().length < 8}
                          onClick={() => void run('resolve', () => resolveIncident(incident.id, decision, note.trim()))}
                        >
                          Resolve
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Breach register" description="Draft notifications are never sent by DVault." flush>
            {breaches.length === 0 ? (
              <div className="p-6">
                <StateBlock title="No breach incidents" description="Create a manual incident to rehearse the 72-hour workflow." />
              </div>
            ) : (
              <div className="divide-y divide-line/70">
                {breaches.map((breach) => (
                  <BreachRow
                    key={breach.id}
                    breach={breach}
                    pending={pending}
                    mode={mode}
                    closeNote={closeNote}
                    onAssess={(notifiable) =>
                      void run(`assess-${breach.id}`, () =>
                        assessBreach(breach.id, {
                          notifiable,
                          reasonCode: notifiable ? 'UNAUTHORIZED_DISCLOSURE' : 'NO_RISK_IDENTIFIED',
                          note: 'Assessment completed in the Security Center.',
                        }),
                      )
                    }
                    onDraft={() => void run(`draft-${breach.id}`, () => draftBreachNotification(breach.id))}
                    onClose={() => void run(`close-${breach.id}`, () => closeBreach(breach.id, closeNote))}
                  />
                ))}
              </div>
            )}
            <div className="grid gap-2 border-t border-line p-3">
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <input
                  value={breachTitle}
                  onChange={(event) => setBreachTitle(event.target.value)}
                  className="rounded-md border border-line bg-surface px-2 py-1.5 text-[10px] text-ink"
                  placeholder="Incident title"
                />
                <select
                  value={breachSeverity}
                  onChange={(event) => setBreachSeverity(event.target.value)}
                  className="rounded-md border border-line bg-surface px-2 py-1.5 text-[10px] text-ink"
                >
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={breachDescription}
                onChange={(event) => setBreachDescription(event.target.value)}
                rows={2}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-[10px] text-ink"
                placeholder="What happened?"
              />
              <div className="flex gap-2">
                <select
                  value={breachSubject}
                  onChange={(event) => setBreachSubject(event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[10px] text-ink"
                >
                  <option value="">No explicit subject</option>
                  {data.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} · {customer.company}
                    </option>
                  ))}
                </select>
                <Button
                  variant="gold"
                  size="sm"
                  disabled={mode !== 'api' || pending !== null || breachTitle.trim().length < 3}
                  onClick={() => void createBreaches()}
                >
                  Register breach
                </Button>
              </div>
              <input
                value={closeNote}
                onChange={(event) => setCloseNote(event.target.value)}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-[10px] text-ink"
                placeholder="Close note (min 8 characters)"
              />
              <p className="text-[9px] leading-3.5 text-ink-faint">
                Manual incidents are allowed even when the chain is intact. The draft notification is
                labelled DRAFT — NOT SENT and there is no send endpoint.
              </p>
            </div>
          </Panel>

          <Panel title="Audit ledger" description="Recent canonical events; the server verifier is authoritative." flush>
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-panel-muted text-[8.5px] uppercase tracking-[0.12em] text-ink-faint">
                  <tr>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Severity</th>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((event) => (
                    <tr key={event.id} className="border-t border-line/70 text-[10px]">
                      <td className="px-3 py-1.5">
                        <span className="font-medium text-ink">{event.action}</span>
                        <span className="ml-1 text-ink-faint">· {event.target}</span>
                      </td>
                      <td className="px-3 py-1.5 capitalize text-ink-soft">{event.category}</td>
                      <td className="px-3 py-1.5">
                        <Badge tone={event.severity === 'critical' ? 'danger' : event.severity === 'warning' ? 'warning' : 'neutral'}>
                          {event.severity}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-[9px] text-ink-faint">
                        {formatDateTime(event.at)}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[8.5px] text-ink-faint">
                        {event.hash.slice(0, 12)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <aside className="flex w-[330px] shrink-0 flex-col gap-4">
          <Panel title="Checkpoints" description="Ed25519-signed evidence anchors.">
            {data.checkpoints.length === 0 ? (
              <StateBlock title="No checkpoints" description="Verify the chain and sign a checkpoint." />
            ) : (
              <div className="space-y-2">
                {data.checkpoints.map((checkpoint) => (
                  <div key={checkpoint.id} className="rounded-md border border-line bg-surface px-2.5 py-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-success" />
                      <span className="text-[10px] font-semibold text-ink">
                        Sequence {checkpoint.eventsCovered}
                      </span>
                      <Badge tone={checkpoint.status === 'verified' ? 'success' : checkpoint.status === 'failed' ? 'danger' : 'neutral'} className="ml-auto capitalize">
                        {checkpoint.status}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-[8.5px] text-ink-faint" title={checkpoint.hash}>
                      {checkpoint.hash}
                    </p>
                    <p className="mt-0.5 text-[8.5px] text-ink-faint">{formatDateTime(checkpoint.at)}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {controlsVisible && (
            <Panel title="Rehearsal controls" description="Synthetic workspace only. Never enabled in production.">
              <div className="space-y-2">
                <div className="rounded-md border border-warning/30 bg-warning-soft/60 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#7d5c1c]">
                  Rehearsal controls — synthetic data only
                </div>
                <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Source
                  <select
                    value={failureSourceId || data.sources[0]?.id || ''}
                    onChange={(event) => setFailureSourceId(event.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[10px] text-ink"
                  >
                    {data.sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending !== null}
                    onClick={() =>
                      void run('source-failure', () =>
                        injectFailure('source_connector', failureSourceId || data.sources[0]?.id),
                      )
                    }
                  >
                    <AlertTriangle className="size-3.5" />
                    Fail source
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending !== null}
                    onClick={() =>
                      void run('hold', () =>
                        injectFailure('retention_hold', data.demo?.userSubjectRef ?? undefined),
                      )
                    }
                  >
                    <Siren className="size-3.5" />
                    Create hold
                  </Button>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  className="w-full"
                  disabled={pending !== null}
                  onClick={() => setConfirm('tamper')}
                >
                  <Fingerprint className="size-3.5" />
                  Tamper audit chain
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={pending !== null}
                  onClick={() => void run('clear', clearFailures)}
                >
                  <RotateCcw className="size-3.5" />
                  Clear rehearsal failures
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className="w-full"
                  disabled={pending !== null || !data.demo?.resetAvailable}
                  onClick={() => setConfirm('reset')}
                >
                  <Trash2 className="size-3.5" />
                  Reset synthetic workspace
                </Button>
              </div>
            </Panel>
          )}

          <Panel title="Boundaries" description="What verification proves.">
            <p className="text-[9.5px] leading-4 text-ink-soft">
              {integrity?.disclaimer ??
                'Verification establishes consistency with the recorded chain and a signed checkpoint. It does not establish that every real-world action was recorded or that recorded events are true.'}
            </p>
          </Panel>
        </aside>
      </div>

      <ConfirmDialog
        open={confirm === 'tamper'}
        onClose={() => setConfirm(null)}
        title="Tamper with the audit chain?"
        description="This deliberately edits a persisted event so verification fails and managed actions block. Use Clear rehearsal failures to restore it."
        confirmLabel="Tamper evidence"
        tone="danger"
        onConfirm={() => {
          setConfirm(null)
          void run('tamper', () => injectFailure('audit_tamper'))
        }}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        onClose={() => setConfirm(null)}
        title="Reset the synthetic workspace?"
        description="This deletes persisted demo state, rebuilds the fixtures and seed data, and creates a new signed checkpoint. It cannot be undone."
        confirmLabel="Reset workspace"
        tone="danger"
        onConfirm={() => {
          setConfirm(null)
          void resetDemo()
        }}
      />
    </div>
  )
}

function BreachRow({
  breach,
  pending,
  mode,
  closeNote,
  onAssess,
  onDraft,
  onClose,
}: {
  breach: BreachIncident
  pending: string | null
  mode: string
  closeNote: string
  onAssess: (notifiable: boolean) => void
  onDraft: () => void
  onClose: () => void
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] font-semibold text-ink">{breach.incidentRef}</span>
        <Badge tone={severityTone[breach.severity] ?? 'warning'}>{breach.severity}</Badge>
        <Badge tone={timerTone[breach.timerState] ?? 'neutral'}>{breach.timerState}</Badge>
        <Badge tone="outline">{breach.status}</Badge>
        <span className="ml-auto text-[9px] text-ink-faint">
          {breach.affectedSubjects} subjects · {breach.affectedSources} sources
        </span>
      </div>
      <p className="mt-1 text-[10px] font-medium text-ink">{breach.title}</p>
      <p className="text-[9.5px] text-ink-soft">{breach.description}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-ink-faint">
        <span>Due {formatDateTime(breach.assessmentDueAt)}</span>
        {breach.notifiable !== null && (
          <span>Notifiable: {breach.notifiable ? 'yes' : 'no'}</span>
        )}
        <span>Notification: {breach.notificationStatus}</span>
      </div>
      {breach.status !== 'CLOSED' && (
        <div className="mt-2 flex flex-wrap gap-2">
          {breach.status === 'DRAFT' && (
            <>
              <Button variant="outline" size="sm" disabled={mode !== 'api' || pending !== null} onClick={() => onAssess(true)}>
                Assess notifiable
              </Button>
              <Button variant="ghost" size="sm" disabled={mode !== 'api' || pending !== null} onClick={() => onAssess(false)}>
                Assess no risk
              </Button>
            </>
          )}
          {breach.status === 'ASSESSED' && (
            <Button variant="outline" size="sm" disabled={mode !== 'api' || pending !== null} onClick={onDraft}>
              Draft notification
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={mode !== 'api' || pending !== null || closeNote.trim().length < 8}
            onClick={onClose}
            title={closeNote.trim().length < 8 ? 'Add a close note (min 8 characters)' : undefined}
          >
            Close with note
          </Button>
        </div>
      )}
    </div>
  )
}
