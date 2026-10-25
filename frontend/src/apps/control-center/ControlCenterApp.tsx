import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileWarning,
  Network,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  selectActivitySeries,
  selectAuditIntegrity,
  selectGovernanceHealth,
  selectJobSummary,
  selectPolicySummary,
  selectRightsSummary,
  selectSourceSummaries,
} from '@/data/selectors'
import type {
  JobStatus,
  PolicyOutcome,
  RightsRequest,
  SourceStatus,
} from '@/domain/types'
import { formatDate, formatDateTime, formatRelative, truncateMiddle } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import type { WorkspaceSection } from '@/store/window-provider'
import { FileClock, ListChecks, Scale, Send, ShieldAlert } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MetricCard } from '@/components/ui/metric-card'
import { Panel, SectionLabel } from '@/components/ui/panel'
import { Progress } from '@/components/ui/progress'
import { Skeleton, StateBlock } from '@/components/ui/state-block'

const sourceTone: Record<SourceStatus, BadgeTone> = {
  connected: 'success',
  degraded: 'warning',
  disconnected: 'danger',
}

const jobTone: Record<JobStatus, BadgeTone> = {
  running: 'info',
  queued: 'neutral',
  retrying: 'gold',
  partial: 'warning',
  review: 'gold',
  completed: 'success',
  failed: 'danger',
}

const rightsTone: Record<RightsRequest['status'], BadgeTone> = {
  open: 'neutral',
  'in-progress': 'info',
  partial: 'warning',
  review: 'gold',
  complete: 'success',
  failed: 'danger',
}

const outcomeTone: Record<PolicyOutcome, BadgeTone> = {
  allow: 'success',
  review: 'warning',
  deny: 'danger',
}

const outcomeLabel: Record<PolicyOutcome, string> = {
  allow: 'Allow',
  review: 'Review',
  deny: 'Deny',
}

function ScoreRing({ score }: { score: number }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const dash = (score / 100) * circumference
  return (
    <div className="relative size-[134px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <defs>
          <linearGradient id="score-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#D8B267" />
            <stop offset="0.55" stopColor="#B7892F" />
            <stop offset="1" stopColor="#8A6420" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#ece5d8" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="url(#score-gradient)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[30px] font-semibold leading-none tracking-tight text-ink tnum">
          {score}
        </span>
        <span className="mt-1 text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          of 100
        </span>
      </div>
    </div>
  )
}

export function ControlCenterApp({
  onNavigate,
}: {
  onNavigate: (section: WorkspaceSection) => void
}) {
  const { data, status, error, refresh, refreshing, retryJob } = useDemo()

  if (status === 'loading' || (status === 'ready' && !data)) {
    return <ControlCenterSkeleton />
  }

  if (status === 'error' || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <StateBlock
          tone="error"
          title="The control center could not load"
          description={error ?? 'The synthetic repository did not respond. Try again.'}
        >
          <Button variant="gold" onClick={() => void refresh()}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        </StateBlock>
      </div>
    )
  }

  const referenceNow = data.generatedAt
    ? new Date(data.generatedAt)
    : new Date('2026-10-24T17:10:00Z')
  const health = selectGovernanceHealth(data)
  const policy = selectPolicySummary(data)
  const sources = selectSourceSummaries(data)
  const rights = selectRightsSummary(data, referenceNow)
  const jobs = selectJobSummary(data)
  const integrity = selectAuditIntegrity(data)
  const activity = selectActivitySeries(data, 14, referenceNow)
  const connected = data.sources.filter((source) => source.status === 'connected').length
  const activeJobs = data.jobs.filter(
    (job) => job.status === 'running' || job.status === 'failed' || job.status === 'retrying',
  )
  const openRights = data.rightsRequests
    .filter((request) => request.status !== 'complete')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const recentPolicies = [...data.policies]
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
    .slice(0, 3)
  const recentEvents = [...data.auditEvents]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3)

  const dueInDays = (value: string) =>
    Math.ceil((new Date(value).getTime() - referenceNow.getTime()) / 86_400_000)
  const blocked = data.integrity?.gateState === 'BLOCKED'

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/80 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[14px] font-semibold text-ink">Governance control center</h1>
              <Badge tone="gold" dot>
                Synthetic
              </Badge>
            </div>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              Synthetic snapshot · {data.documents.length} records across {data.sources.length}{' '}
              sources
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={integrity.valid ? 'success' : 'danger'} dot>
            {integrity.valid ? 'Audit chain verified' : 'Integrity issue'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('records')}
            className="hidden sm:inline-flex"
          >
            <Database className="size-3.5" /> Open record library
            <ArrowUpRight className="size-3 text-ink-faint" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh governance data"
            title="Recalculate governance data"
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface px-4 py-1.5">
        {(
          [
            ['policies', 'Policy Center', Scale],
            ['messages', 'Message Gate', Send],
            ['rights', 'Rights Queue', FileClock],
            ['jobs', 'Job Manager', ListChecks],
            ['security', 'Security Center', ShieldAlert],
          ] as const
        ).map(([section, label, Icon]) => (
          <Button
            key={section}
            variant="ghost"
            size="sm"
            onClick={() => onNavigate(section)}
          >
            <Icon className="size-3.5" /> {label}
          </Button>
        ))}
      </div>

      {blocked && (
        <div className="mx-4 mt-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[10.5px] text-[#8f2f2f]">
          Evidence integrity is blocked. Managed dispatch and rights execution are disabled until
          the incident is reviewed in the Security Center.
        </div>
      )}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            label="Governance health"
            value={health.score}
            suffix="/100"
            hint={health.label}
            icon={ShieldCheck}
            tone="gold"
          />
          <MetricCard
            label="Sources connected"
            value={`${connected}/${data.sources.length}`}
            hint={`${data.sources.length - connected} degraded · WhatsApp Business`}
            icon={Network}
            tone="info"
          />
          <MetricCard
            label="Open rights requests"
            value={rights.open + rights.inProgress + rights.partial}
            hint={`${rights.dueSoon} due this week · ${rights.failedSources} failed source`}
            icon={ClipboardCheck}
            tone="warning"
          />
          <MetricCard
            label="Jobs in flight"
            value={jobs.running + jobs.retrying}
            hint={`${jobs.failed} failed · ${jobs.queued} queued`}
            icon={Activity}
            tone="neutral"
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel
              title="Governance health"
              description="Weighted across source connectivity, classification, policy and audit"
              action={<Badge tone="gold">{health.label}</Badge>}
            >
              <div className="flex flex-col gap-5 lg:flex-row">
                <div className="flex shrink-0 items-center gap-4">
                  <ScoreRing score={health.score} />
                  <div className="min-w-0 space-y-2.5">
                    {health.factors.map((factor) => (
                      <div key={factor.key} className="w-[172px]">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10.5px] font-medium text-ink-soft">
                            {factor.label}
                          </span>
                          <span className="text-[10.5px] font-semibold text-ink tnum">
                            {factor.value}
                          </span>
                        </div>
                        <Progress
                          value={factor.value}
                          tone={factor.value >= 85 ? 'success' : factor.value >= 70 ? 'gold' : 'warning'}
                          className="mt-1 h-1"
                          label={`${factor.label}: ${factor.value} percent`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 flex-1 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold text-ink">Records touched</p>
                      <p className="text-[10px] text-ink-faint">Last 14 days · source modifications</p>
                    </div>
                    <span className="text-[10px] text-ink-faint tnum">
                      {activity.reduce((total, point) => total + point.value, 0)} updates
                    </span>
                  </div>
                  <div className="mt-3 h-[150px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activity} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
                        <defs>
                          <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#B7892F" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#B7892F" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#E7E0D2"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          interval={3}
                          tick={{ fontSize: 9, fill: '#8B8373' }}
                        />
                        <YAxis hide domain={[0, 'dataMax + 1']} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: '1px solid #E5DED0',
                            background: '#FFFDF8',
                            fontSize: 10.5,
                            boxShadow: '0 8px 24px -12px rgba(36,33,27,0.35)',
                          }}
                          labelStyle={{ color: '#615A4D', fontSize: 10 }}
                          formatter={(value) => [`${value} records`, 'Touched']}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#B7892F"
                          strokeWidth={1.8}
                          fill="url(#activity-fill)"
                          activeDot={{ r: 3, fill: '#8A6420' }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel
              title="Source connectivity"
              description={`${connected} of ${data.sources.length} sources healthy · 1 needs attention`}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[10.5px]"
                  onClick={() => onNavigate('records')}
                >
                  View sources <ArrowUpRight className="size-3" />
                </Button>
              }
              flush
            >
              <div className="divide-y divide-line/80">
                <div className="grid grid-cols-[minmax(0,1.6fr)_84px_54px_92px] items-center gap-3 px-5 py-2 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  <span>Source</span>
                  <span>Status</span>
                  <span className="text-right">Records</span>
                  <span>Health</span>
                </div>
                {sources.map(({ source, documentCount }) => (
                  <div
                    key={source.id}
                    className="grid grid-cols-[minmax(0,1.6fr)_84px_54px_92px] items-center gap-3 px-5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11.5px] font-medium text-ink">{source.name}</p>
                      <p className="truncate text-[10px] text-ink-faint">
                        {source.provider} · synced {formatRelative(source.lastSync)}
                      </p>
                    </div>
                    <Badge tone={sourceTone[source.status]} dot>
                      {source.status}
                    </Badge>
                    <span className="text-right text-[11px] text-ink-soft tnum">
                      {documentCount}
                    </span>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={source.health}
                        tone={source.health >= 85 ? 'success' : source.health >= 70 ? 'gold' : 'danger'}
                        className="h-1"
                        label={`${source.name} health`}
                      />
                      <span className="w-5 text-right text-[10px] text-ink-faint tnum">
                        {source.health}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Jobs"
              description="Sync, indexing and integrity work in the demo runner"
              action={
                <div className="flex items-center gap-1.5">
                  <Badge tone={jobs.failed ? 'danger' : 'success'} dot>
                    {jobs.failed ? `${jobs.failed} failed` : 'All healthy'}
                  </Badge>
                </div>
              }
              flush
            >
              <div className="divide-y divide-line/80">
                {activeJobs.map((job) => (
                  <div key={job.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-soft">
                      {job.status === 'failed' ? (
                        <FileWarning className="size-3.5" />
                      ) : (
                        <Zap className="size-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[11.5px] font-medium text-ink">{job.name}</p>
                        <Badge tone={jobTone[job.status]} dot>
                          {job.status}
                        </Badge>
                        <span className="text-[10px] text-ink-faint tnum">
                          {job.attempts}/{job.maxAttempts} attempts
                        </span>
                      </div>
                      {job.failureSummary ? (
                        <p className="mt-1 line-clamp-2 text-[10.5px] leading-4 text-danger">
                          {job.failureSummary}
                        </p>
                      ) : (
                        <p className="mt-1 text-[10.5px] text-ink-faint">
                          {job.status === 'running'
                            ? `Processing · started ${formatRelative(job.startedAt)}`
                            : job.timeline[job.timeline.length - 1]?.label}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <Progress
                          value={job.progress}
                          tone={
                            job.status === 'failed'
                              ? 'danger'
                              : job.status === 'running'
                                ? 'gold'
                                : job.status === 'retrying'
                                  ? 'info'
                                  : 'neutral'
                          }
                          className="h-1"
                          label={`${job.name} progress`}
                        />
                        <span className="w-7 text-right text-[10px] text-ink-faint tnum">
                          {Math.round(job.progress)}%
                        </span>
                      </div>
                    </div>
                    {job.status === 'failed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-0.5 h-7 px-2 text-[10.5px]"
                        onClick={() => void retryJob(job.id)}
                      >
                        <RefreshCw className="size-3" /> Retry
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Panel
              title="Policy health"
              description="Latest evaluation outcomes across active policies"
              action={<Badge tone="gold">{policy.total} decisions</Badge>}
            >
              <div className="flex items-center gap-4">
                <div className="relative h-[142px] w-[142px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Allow', value: policy.allow, color: '#2F7D5D' },
                          { name: 'Review', value: policy.review, color: '#B7892F' },
                          { name: 'Deny', value: policy.deny, color: '#B64235' },
                        ]}
                        dataKey="value"
                        innerRadius={45}
                        outerRadius={64}
                        paddingAngle={3}
                        strokeWidth={0}
                        startAngle={90}
                        endAngle={-270}
                        isAnimationActive={false}
                      >
                        {['#2F7D5D', '#B7892F', '#B64235'].map((color) => (
                          <Cell key={color} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid #E5DED0',
                          background: '#FFFDF8',
                          fontSize: 10.5,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[23px] font-semibold leading-none text-ink tnum">
                      {policy.total}
                    </span>
                    <span className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-ink-faint">
                      decisions
                    </span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {(
                    [
                      ['allow', policy.allow, policy.allowShare, 'success'],
                      ['review', policy.review, policy.reviewShare, 'warning'],
                      ['deny', policy.deny, policy.denyShare, 'danger'],
                    ] as const
                  ).map(([label, count, share, tone]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span
                        className={cn(
                          'size-2 rounded-sm',
                          tone === 'success' && 'bg-success',
                          tone === 'warning' && 'bg-gold',
                          tone === 'danger' && 'bg-danger',
                        )}
                        aria-hidden
                      />
                      <span className="flex-1 text-[10.5px] capitalize text-ink-soft">{label}</span>
                      <span className="text-[10.5px] font-medium text-ink tnum">{count}</span>
                      <span className="w-9 text-right text-[9.5px] text-ink-faint tnum">
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                  <div className="mt-3 rounded-md border border-line bg-surface px-2.5 py-2 text-[10px] leading-4 text-ink-faint">
                    Alignment score <span className="font-semibold text-ink">{Math.round(policy.weightedScore)}</span> · weighted for review work
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-line pt-3">
                <SectionLabel>Recent decisions</SectionLabel>
                <ul className="mt-2 space-y-2">
                  {recentPolicies.map((decision) => (
                    <li key={decision.id} className="flex items-start gap-2.5">
                      <Badge tone={outcomeTone[decision.outcome]}>
                        {outcomeLabel[decision.outcome]}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10.5px] font-medium text-ink">
                          {decision.policyName}
                        </p>
                        <p className="truncate text-[10px] text-ink-faint">{decision.subject}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>

            <Panel
              title="Rights requests"
              description="Requests that still need work across sources"
              action={<Badge tone="warning">{rights.dueSoon} due soon</Badge>}
              flush
            >
              <div className="divide-y divide-line/80">
                {openRights.map((request) => {
                  const customer = data.customers.find(
                    (entry) => entry.id === request.customerId,
                  )
                  const remaining = request.sourceProgress.filter(
                    (progress) => progress.status === 'pending' || progress.status === 'failed',
                  ).length
                  return (
                    <div key={request.id} className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-ink">
                          {request.reference}
                        </span>
                        <span className="text-[10.5px] capitalize text-ink-soft">
                          {request.type}
                        </span>
                        <Badge tone={rightsTone[request.status]} className="ml-auto">
                          {request.status.replace('-', ' ')}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-[10.5px] text-ink-faint">
                        {customer?.company} · due {formatDate(request.dueAt)} ·{' '}
                        {remaining === 0
                          ? 'all sources complete'
                          : `${remaining} source${remaining === 1 ? '' : 's'} unresolved`}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1">
                        {request.sourceProgress.map((progress) => (
                          <span
                            key={progress.sourceId}
                            title={`${data.sources.find((source) => source.id === progress.sourceId)?.name}: ${progress.status}`}
                            className={cn(
                              'h-1 w-5 rounded-full',
                              progress.status === 'complete' && 'bg-success',
                              progress.status === 'pending' && 'bg-line-strong',
                              progress.status === 'failed' && 'bg-danger',
                              progress.status === 'not-applicable' && 'bg-line/70',
                            )}
                          />
                        ))}
                        <span className="ml-1 text-[9.5px] text-ink-faint">
                          {dueInDays(request.dueAt) <= 7
                            ? `${dueInDays(request.dueAt)} days left`
                            : `${formatDate(request.dueAt)}`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>

            <Panel
              title="Audit integrity"
              description="Hash-chained events and sealed checkpoints"
              action={
                <Badge tone={integrity.valid ? 'success' : 'danger'} dot>
                  {integrity.valid ? 'Verified' : 'Broken chain'}
                </Badge>
              }
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg border',
                    integrity.valid
                      ? 'border-success/20 bg-success-soft text-success'
                      : 'border-danger/20 bg-danger-soft text-danger',
                  )}
                >
                  {integrity.valid ? (
                    <CheckCircle2 className="size-4.5" />
                  ) : (
                    <TriangleAlert className="size-4.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-medium text-ink">
                    {integrity.verifiedCount} of {data.auditEvents.length} events verified
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-faint">
                    Latest checkpoint{' '}
                    {data.checkpoints[data.checkpoints.length - 1]
                      ? formatDateTime(
                          data.checkpoints[data.checkpoints.length - 1].at,
                        )
                      : 'not sealed'}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[9.5px] text-ink-faint">
                    <ShieldCheck className="size-3 shrink-0 text-gold" />
                    <span className="truncate">{truncateMiddle(integrity.head, 18, 8)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-line pt-3">
                <SectionLabel>Recent events</SectionLabel>
                <ul className="mt-2 space-y-2">
                  {recentEvents.map((event) => (
                    <li key={event.id} className="flex items-start gap-2">
                      <span
                        className={cn(
                          'mt-1 size-1.5 shrink-0 rounded-full',
                          event.severity === 'critical'
                            ? 'bg-danger'
                            : event.severity === 'warning'
                              ? 'bg-gold'
                              : 'bg-success',
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10.5px] text-ink">{event.action}</p>
                        <p className="text-[9.5px] text-ink-faint">
                          {event.actor} · {formatRelative(event.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}

function ControlCenterSkeleton() {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-52" />
          <Skeleton className="h-2.5 w-72" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[102px] rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <Skeleton className="h-[320px] rounded-xl" />
          <Skeleton className="h-[320px] rounded-xl" />
        </div>
      </div>
    </div>
  )
}
