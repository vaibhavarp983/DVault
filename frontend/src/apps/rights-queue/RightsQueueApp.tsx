import { Download, FileClock, Lock, Play, RefreshCw, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type {
  RightsRequest,
  RightsRequestType,
  SourceProgressStatus,
} from '@/domain/types'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Progress } from '@/components/ui/progress'
import { Skeleton, StateBlock } from '@/components/ui/state-block'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import { ApiRequired } from '@/apps/integration/ApiRequired'
import { StatusBanner } from '@/apps/integration/StatusBanner'

const statusTone: Record<RightsRequest['status'], BadgeTone> = {
  open: 'neutral',
  'in-progress': 'info',
  partial: 'warning',
  review: 'gold',
  complete: 'success',
  failed: 'danger',
}

const sourceTone: Record<SourceProgressStatus, BadgeTone> = {
  pending: 'neutral',
  running: 'info',
  complete: 'success',
  failed: 'danger',
  restricted: 'warning',
  'not-applicable': 'neutral',
}

const requestTypes: { value: RightsRequestType; label: string }[] = [
  { value: 'access', label: 'Access summary' },
  { value: 'portability', label: 'Portability bundle' },
  { value: 'erasure', label: 'Erasure' },
  { value: 'rectification', label: 'Rectification' },
  { value: 'objection', label: 'Objection / withdrawal' },
]

const tabs: (RightsRequest['status'] | 'all')[] = [
  'all',
  'open',
  'in-progress',
  'partial',
  'review',
  'complete',
  'failed',
]

export function RightsQueueApp() {
  const {
    data,
    status,
    error,
    refresh,
    refreshing,
    mode,
    apiBaseUrl,
    createRightsRequest,
    planRightsRequest,
    executeRightsRequest,
    retryRightsRequest,
    releaseHold,
  } = useDemo()
  const [selectedId, setSelectedId] = useState('')
  const [tab, setTab] = useState<(typeof tabs)[number]>('all')
  const [subject, setSubject] = useState('')
  const [requestType, setRequestType] = useState<RightsRequestType>('access')
  const [field, setField] = useState('email')
  const [requestedValue, setRequestedValue] = useState('')
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedId && data?.rightsRequests[0]) setSelectedId(data.rightsRequests[0].id)
  }, [data, selectedId])

  const selected = data?.rightsRequests.find((request) => request.id === selectedId)
  const filtered = useMemo(
    () => (data?.rightsRequests ?? []).filter((request) => tab === 'all' || request.status === tab),
    [data, tab],
  )
  const holds = (data?.rightsHolds ?? []).filter(
    (hold) => !selected || !hold.subjectRef || hold.subjectRef === selected.customerId,
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
        <StateBlock tone="error" title="Rights Queue unavailable" description={error ?? 'The workspace could not be loaded.'}>
          <Button variant="gold" onClick={() => void refresh()}>
            Retry
          </Button>
        </StateBlock>
      </div>
    )
  }

  const blocked = data.integrity?.gateState === 'BLOCKED'
  const selectedSubject = subject || data.customers[0]?.id || ''
  const sourceName = (sourceId: string) =>
    data.sources.find((source) => source.id === sourceId)?.name ?? 'Unknown source'

  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key)
    try {
      await action()
    } finally {
      setPending(null)
    }
  }

  const create = async () => {
    if (mode !== 'api' || !selectedSubject) return
    await run('create', () =>
      createRightsRequest({
        subjectRef: selectedSubject,
        requestType: requestType.toUpperCase(),
        correction:
          requestType === 'rectification'
            ? { field, requestedValue, reason: 'Synthetic rectification request' }
            : undefined,
      }),
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-gold-soft text-gold-ink">
          <FileClock className="size-4" strokeWidth={1.8} />
        </span>
        <div>
          <h1 className="text-[12.5px] font-semibold text-ink">Rights Queue</h1>
          <p className="text-[9.5px] text-ink-faint">
            {data.rightsRequests.length} requests · {data.rightsHolds?.length ?? 0} holds
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={blocked ? 'danger' : 'success'}>{blocked ? 'Execution blocked' : 'Execution open'}</Badge>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <StatusBanner integrity={data.integrity} compact />
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-[10px] font-medium capitalize',
                  tab === value
                    ? 'border-gold/30 bg-gold-soft text-gold-ink'
                    : 'border-line bg-surface text-ink-faint hover:text-ink-soft',
                )}
              >
                {value.replace('-', ' ')}
              </button>
            ))}
          </div>

          <Panel title="Requests" description="Every completion state is persisted, including partial and review." flush>
            {filtered.length === 0 ? (
              <div className="p-6">
                <StateBlock title="No requests in this state" description="Create a request or change the filter." />
              </div>
            ) : (
              <div className="divide-y divide-line/70">
                {filtered.map((request) => {
                  const customer = data.customers.find((entry) => entry.id === request.customerId)
                  const complete = request.sourceProgress.filter((entry) => entry.status === 'complete').length
                  return (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => setSelectedId(request.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left',
                        selectedId === request.id ? 'bg-gold-soft/40' : 'hover:bg-panel-muted/60',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10.5px] font-semibold text-ink">{request.reference}</span>
                          <Badge tone={statusTone[request.status]} className="capitalize">
                            {request.status}
                          </Badge>
                          <Badge tone="outline" className="capitalize">
                            {request.type}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-[9.5px] text-ink-faint">
                          {customer?.name ?? request.customerId} · due {formatDate(request.dueAt)}
                        </p>
                      </div>
                      <div className="w-24 shrink-0">
                        <Progress
                          value={
                            request.sourceProgress.length
                              ? (complete / request.sourceProgress.length) * 100
                              : 0
                          }
                          tone={request.status === 'complete' ? 'success' : request.status === 'failed' ? 'danger' : 'gold'}
                          label={`${complete}/${request.sourceProgress.length} sources`}
                        />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Panel>

          {selected && (
            <Panel title={`Source progress · ${selected.reference}`} description="Restricted and failed actions are never reported as deletion." flush>
              {selected.sourceProgress.length === 0 ? (
                <div className="p-6">
                  <StateBlock title="No source actions yet" description="Plan the request to resolve the subject's sources." />
                </div>
              ) : (
                <div className="divide-y divide-line/70">
                  {selected.sourceProgress.map((progress) => (
                    <div key={`${progress.sourceId}-${progress.status}`} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink">
                        {sourceName(progress.sourceId)}
                      </span>
                      <Badge tone={sourceTone[progress.status]} className="capitalize">
                        {progress.status}
                      </Badge>
                      <span className="w-[220px] shrink-0 truncate text-[9.5px] text-ink-faint" title={progress.detail}>
                        {progress.detail}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
                <span className="text-[9.5px] text-ink-faint">{selected.notes}</span>
                <div className="ml-auto flex gap-2">
                  {selected.artifact && (
                    <a
                      href={
                        selected.artifact.downloadUrl && apiBaseUrl
                          ? `${apiBaseUrl}${selected.artifact.downloadUrl}`
                          : undefined
                      }
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[9.5px] font-medium text-ink-soft',
                        (!selected.artifact.downloadUrl || !apiBaseUrl) && 'pointer-events-none opacity-40',
                      )}
                    >
                      <Download className="size-3" />
                      {selected.artifact.kind === 'PORTABILITY_BUNDLE' ? 'Bundle' : 'Artifact'}
                    </a>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={mode !== 'api' || blocked || pending !== null || selected.status !== 'open'}
                    onClick={() => void run('plan', () => planRightsRequest(selected.id))}
                  >
                    <RefreshCw className="size-3.5" />
                    Plan
                  </Button>
                  <Button
                    variant="gold"
                    size="sm"
                    disabled={
                      mode !== 'api' ||
                      blocked ||
                      pending !== null ||
                      !['open', 'in-progress', 'partial', 'review'].includes(selected.status)
                    }
                    title={blocked ? 'Rights execution is blocked by an evidence integrity incident.' : undefined}
                    onClick={() => void run('execute', () => executeRightsRequest(selected.id))}
                  >
                    <Play className="size-3.5" />
                    Execute
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      mode !== 'api' ||
                      blocked ||
                      pending !== null ||
                      !['partial', 'failed', 'review'].includes(selected.status)
                    }
                    onClick={() => void run('retry', () => retryRightsRequest(selected.id))}
                  >
                    <RotateCw className="size-3.5" />
                    Retry unresolved
                  </Button>
                </div>
              </div>
            </Panel>
          )}
        </div>

        <aside className="flex w-[340px] shrink-0 flex-col gap-4">
          <Panel title="Create a request" description="Creates, plans, and persists source actions.">
            {mode !== 'api' ? (
              <ApiRequired action="Rights request creation" />
            ) : (
              <div className="space-y-2">
                <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Customer
                  <select
                    value={selectedSubject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[10.5px] text-ink"
                  >
                    {data.customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} · {customer.company}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Right
                  <select
                    value={requestType}
                    onChange={(event) => setRequestType(event.target.value as RightsRequestType)}
                    className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[10.5px] text-ink"
                  >
                    {requestTypes.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                {requestType === 'rectification' && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                      Field
                      <input
                        value={field}
                        onChange={(event) => setField(event.target.value)}
                        className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[10.5px] text-ink"
                      />
                    </label>
                    <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                      New value
                      <input
                        value={requestedValue}
                        onChange={(event) => setRequestedValue(event.target.value)}
                        className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[10.5px] text-ink"
                      />
                    </label>
                  </div>
                )}
                <Button
                  variant="gold"
                  size="sm"
                  className="w-full"
                  disabled={
                    pending !== null ||
                    !selectedSubject ||
                    (requestType === 'rectification' && !requestedValue.trim())
                  }
                  onClick={() => void create()}
                >
                  {pending === 'create' ? 'Creating…' : 'Create and plan'}
                </Button>
              </div>
            )}
          </Panel>

          <Panel title="Retention holds" description="Active holds restrict erasure only.">
            {holds.length === 0 ? (
              <StateBlock title="No active holds" description="Erasing the selected subject is not restricted." />
            ) : (
              <div className="space-y-2">
                {holds.map((hold) => (
                  <div key={hold.id} className="rounded-md border border-warning/25 bg-warning-soft/50 px-2.5 py-2">
                    <div className="flex items-center gap-1.5">
                      <Lock className="size-3.5 text-[#8a671f]" />
                      <span className="text-[10px] font-semibold text-[#7d5c1c]">{hold.reasonCode}</span>
                      <Badge tone={hold.status === 'ACTIVE' ? 'warning' : 'neutral'} className="ml-auto capitalize">
                        {hold.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[9px] leading-3.5 text-[#7d5c1c]/80">
                      {hold.reviewNote ?? 'Scoped retention hold.'}
                    </p>
                    {hold.status === 'ACTIVE' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full"
                        disabled={mode !== 'api' || pending !== null}
                        onClick={() =>
                          void run('hold', () =>
                            releaseHold(hold.id, 'Released from the Rights Queue demo control.'),
                          )
                        }
                      >
                        Release hold
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {selected && (
            <Panel title="Request detail" description="Persisted metadata and review notes.">
              <dl className="space-y-1.5 text-[10px]">
                {[
                  ['Reference', selected.reference],
                  ['Status', selected.status],
                  ['Type', selected.type],
                  ['Received', formatDateTime(selected.receivedAt)],
                  ['Due', formatDate(selected.dueAt)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-ink-faint">{label}</dt>
                    <dd className="text-right font-medium capitalize text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}
