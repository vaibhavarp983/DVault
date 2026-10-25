import { ListChecks, RefreshCw, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Job, JobStatus } from '@/domain/types'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Progress } from '@/components/ui/progress'
import { Skeleton, StateBlock } from '@/components/ui/state-block'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'

const statusTone: Record<JobStatus, BadgeTone> = {
  queued: 'neutral',
  running: 'info',
  retrying: 'gold',
  partial: 'warning',
  review: 'gold',
  completed: 'success',
  failed: 'danger',
}

const toneTone: Record<string, BadgeTone> = {
  neutral: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}

const kinds: (Job['kind'] | 'all')[] = ['all', 'rights', 'import', 'checkpoint']
const statuses: (JobStatus | 'all')[] = [
  'all',
  'running',
  'retrying',
  'partial',
  'review',
  'completed',
  'failed',
]

export function JobManagerApp() {
  const { data, status, error, refresh, refreshing, mode, retryJob } = useDemo()
  const [kind, setKind] = useState<(typeof kinds)[number]>('all')
  const [jobStatus, setJobStatus] = useState<(typeof statuses)[number]>('all')
  const [selectedId, setSelectedId] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!selectedId && data?.jobs[0]) setSelectedId(data.jobs[0].id)
  }, [data, selectedId])

  const jobs = useMemo(
    () =>
      (data?.jobs ?? []).filter(
        (job) =>
          (kind === 'all' || job.kind === kind) &&
          (jobStatus === 'all' || job.status === jobStatus),
      ),
    [data, kind, jobStatus],
  )
  const selected = data?.jobs.find((job) => job.id === selectedId)

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
        <StateBlock tone="error" title="Job Manager unavailable" description={error ?? 'The workspace could not be loaded.'}>
          <Button variant="gold" onClick={() => void refresh()}>
            Retry
          </Button>
        </StateBlock>
      </div>
    )
  }

  const blocked = data.integrity?.gateState === 'BLOCKED'
  const retryable = (job: Job) =>
    job.kind === 'rights' && ['failed', 'partial', 'review'].includes(job.status)

  const retry = async (job: Job) => {
    setPending(true)
    try {
      await retryJob(job.id)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-gold-soft text-gold-ink">
          <ListChecks className="size-4" strokeWidth={1.8} />
        </span>
        <div>
          <h1 className="text-[12.5px] font-semibold text-ink">Job Manager</h1>
          <p className="text-[9.5px] text-ink-faint">Rights jobs, import jobs, and signed checkpoints.</p>
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
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-wrap gap-1.5">
              {kinds.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-[10px] font-medium capitalize',
                    kind === value
                      ? 'border-gold/30 bg-gold-soft text-gold-ink'
                      : 'border-line bg-surface text-ink-faint hover:text-ink-soft',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {statuses.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setJobStatus(value)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-[10px] font-medium capitalize',
                    jobStatus === value
                      ? 'border-gold/30 bg-gold-soft text-gold-ink'
                      : 'border-line bg-surface text-ink-faint hover:text-ink-soft',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <Panel title="Jobs" description="Persisted jobs and their immutable event timelines." flush>
            {jobs.length === 0 ? (
              <div className="p-6">
                <StateBlock title="No jobs match" description="Change the filters or run an action that creates durable work." />
              </div>
            ) : (
              <div className="divide-y divide-line/70">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedId(job.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left',
                      selectedId === job.id ? 'bg-gold-soft/40' : 'hover:bg-panel-muted/60',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-[10.5px] font-semibold text-ink">{job.name}</span>
                        <Badge tone="outline" className="uppercase">{job.kind}</Badge>
                        <Badge tone={statusTone[job.status]} className="capitalize">{job.status}</Badge>
                      </div>
                      <p className="mt-0.5 text-[9px] text-ink-faint">
                        {job.kind === 'rights'
                          ? `Attempt ${job.attempts}/${job.maxAttempts}`
                          : job.kind === 'checkpoint'
                            ? 'Signed evidence checkpoint'
                            : 'Fixture import'}
                        {job.failureSummary ? ` · ${job.failureSummary}` : ''}
                      </p>
                    </div>
                    <div className="w-28 shrink-0">
                      <Progress
                        value={job.progress}
                        tone={job.status === 'failed' ? 'danger' : job.status === 'completed' ? 'success' : 'gold'}
                        label={`${job.name} progress`}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-[9px] text-ink-faint">
                      {formatDateTime(job.finishedAt ?? job.startedAt)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <aside className="flex w-[340px] shrink-0 flex-col gap-4">
          <Panel title="Timeline" description="Ordered job events from the control plane.">
            {!selected ? (
              <StateBlock title="Select a job" description="Choose a job to inspect its timeline." />
            ) : (
              <div className="space-y-2">
                {selected.timeline.map((entry, index) => (
                  <div key={`${entry.at}-${index}`} className="flex gap-2">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-gold" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-ink">{entry.label}</p>
                      <p className="text-[9px] text-ink-faint">{formatDateTime(entry.at)}</p>
                    </div>
                    <Badge tone={toneTone[entry.tone] ?? 'neutral'} className="ml-auto h-fit shrink-0">
                      {entry.tone}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {selected && (
            <Panel title="Actions" description="Retries create a new durable job.">
              <div className="space-y-2">
                <p className="text-[9.5px] leading-4 text-ink-faint">
                  {selected.kind === 'rights'
                    ? 'Retry only unresolved source actions. Completed actions are never repeated.'
                    : selected.kind === 'import'
                      ? 'Import jobs are recreated by uploading the file; this view does not re-run them.'
                      : 'Checkpoints are immutable evidence anchors.'}
                </p>
                <Button
                  variant="gold"
                  size="sm"
                  className="w-full"
                  disabled={!retryable(selected) || mode !== 'api' || blocked || pending}
                  title={blocked ? 'Rights execution is blocked by an evidence integrity incident.' : undefined}
                  onClick={() => void retry(selected)}
                >
                  <RotateCw className={cn('size-3.5', pending && 'animate-spin')} />
                  Retry rights job
                </Button>
              </div>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}
