import { Play, RefreshCw, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'
import { selectAuditIntegrity } from '@/data/selectors'
import type { PolicyOutcome } from '@/domain/types'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, SectionLabel } from '@/components/ui/panel'
import { Skeleton, StateBlock } from '@/components/ui/state-block'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import { ApiRequired } from '@/apps/integration/ApiRequired'
import { StatusBanner } from '@/apps/integration/StatusBanner'

const outcomeTone: Record<PolicyOutcome, BadgeTone> = {
  allow: 'success',
  review: 'warning',
  deny: 'danger',
}

export function PolicyCenterApp() {
  const { data, status, error, refresh, refreshing, mode, evaluatePolicy } = useDemo()
  const [outcome, setOutcome] = useState<PolicyOutcome | 'all'>('all')
  const [subject, setSubject] = useState('')
  const [purpose, setPurpose] = useState('marketing')
  const [channel, setChannel] = useState('whatsapp')
  const [evaluating, setEvaluating] = useState(false)

  const summary = useMemo(() => {
    const decisions = data?.policies ?? []
    return {
      allow: decisions.filter((entry) => entry.outcome === 'allow').length,
      review: decisions.filter((entry) => entry.outcome === 'review').length,
      deny: decisions.filter((entry) => entry.outcome === 'deny').length,
    }
  }, [data])

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
        <StateBlock
          tone="error"
          title="Policy Center unavailable"
          description={error ?? 'The workspace could not be loaded.'}
        >
          <Button variant="gold" onClick={() => void refresh()}>
            Retry
          </Button>
        </StateBlock>
      </div>
    )
  }

  const decisions = data.policies.filter((entry) => outcome === 'all' || entry.outcome === outcome)
  const selectedSubject = subject || data.customers[0]?.id || ''
  const integrity = selectAuditIntegrity(data)

  const runEvaluation = async () => {
    if (!selectedSubject || mode !== 'api') return
    setEvaluating(true)
    try {
      await evaluatePolicy({ subjectRef: selectedSubject, purpose, channel })
    } finally {
      setEvaluating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-gold-soft text-gold-ink">
          <Scale className="size-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[12.5px] font-semibold text-ink">Policy Center</h1>
          <p className="text-[9.5px] text-ink-faint">
            {data.activePolicy?.name ?? 'No active policy'} · v{data.activePolicy?.version ?? '—'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={integrity.valid ? 'success' : 'danger'}>
            {integrity.valid ? 'Evidence verified' : 'Evidence check required'}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {(['allow', 'review', 'deny'] as const).map((value) => (
              <div key={value} className="rounded-lg border border-line bg-panel px-3 py-2.5">
                <SectionLabel>{value}</SectionLabel>
                <p className="mt-1 text-[20px] font-semibold text-ink tnum">{summary[value]}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'allow', 'review', 'deny'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setOutcome(value)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-[10px] font-medium capitalize',
                  outcome === value
                    ? 'border-gold/30 bg-gold-soft text-gold-ink'
                    : 'border-line bg-surface text-ink-faint hover:text-ink-soft',
                )}
              >
                {value}
              </button>
            ))}
          </div>

          <Panel title="Decision ledger" description="Persisted policy decisions from the control plane." flush>
            {decisions.length === 0 ? (
              <div className="p-6">
                <StateBlock title="No decisions match" description="Run an evaluation or change the outcome filter." />
              </div>
            ) : (
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-panel-muted">
                    <tr className="text-[8.5px] uppercase tracking-[0.12em] text-ink-faint">
                      <th className="px-3 py-2 font-semibold">Outcome</th>
                      <th className="px-3 py-2 font-semibold">Subject</th>
                      <th className="px-3 py-2 font-semibold">Area</th>
                      <th className="px-3 py-2 font-semibold">Explanation</th>
                      <th className="px-3 py-2 font-semibold">Decided</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisions.map((decision) => (
                      <tr key={decision.id} className="border-t border-line/70 text-[10.5px] text-ink-soft">
                        <td className="px-3 py-2">
                          <Badge tone={outcomeTone[decision.outcome]} className="capitalize">
                            {decision.outcome}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-[9.5px] text-ink">{decision.subject}</td>
                        <td className="px-3 py-2 capitalize">{decision.area}</td>
                        <td className="max-w-[280px] px-3 py-2">
                          <p className="truncate" title={decision.explanation}>
                            {decision.explanation}
                          </p>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-[9.5px] text-ink-faint">
                          {formatDateTime(decision.decidedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <aside className="flex w-[320px] shrink-0 flex-col gap-4">
          <StatusBanner integrity={data.integrity} compact />
          <Panel title="Active rules" description="Synthetic managed-marketing policy.">
            {data.activePolicy ? (
              <ul className="space-y-2">
                {data.activePolicy.rules.map((rule) => (
                  <li key={rule.key} className="rounded-md border border-line bg-surface px-2.5 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                      {rule.key.replace(/_/g, ' ')}
                    </p>
                    <p className="mt-0.5 break-words font-mono text-[10px] text-ink-soft">{rule.value}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <StateBlock title="No active policy" description="Seed the workspace to load the managed-marketing policy." />
            )}
          </Panel>

          <Panel title="Evaluate a subject" description="Calls the real policy engine and persists the decision.">
            {mode !== 'api' ? (
              <ApiRequired action="Policy evaluation" />
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
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Purpose
                    <select
                      value={purpose}
                      onChange={(event) => setPurpose(event.target.value)}
                      className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[10.5px] text-ink"
                    >
                      <option value="marketing">marketing</option>
                      <option value="course_updates">course updates</option>
                      <option value="admissions">admissions</option>
                    </select>
                  </label>
                  <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Channel
                    <select
                      value={channel}
                      onChange={(event) => setChannel(event.target.value)}
                      className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[10.5px] text-ink"
                    >
                      <option value="whatsapp">whatsapp</option>
                      <option value="email">email</option>
                    </select>
                  </label>
                </div>
                <Button
                  variant="gold"
                  size="sm"
                  className="w-full"
                  disabled={evaluating || !selectedSubject}
                  onClick={() => void runEvaluation()}
                >
                  <Play className={cn('size-3.5', evaluating && 'animate-pulse')} />
                  Evaluate and persist
                </Button>
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  )
}
