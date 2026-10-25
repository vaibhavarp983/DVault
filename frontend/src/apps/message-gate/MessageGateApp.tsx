import { Eye, RefreshCw, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CampaignDecision, RecipientStatus } from '@/domain/types'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Skeleton, StateBlock } from '@/components/ui/state-block'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import { ApiRequired } from '@/apps/integration/ApiRequired'
import { StatusBanner } from '@/apps/integration/StatusBanner'

const decisionTone: Record<CampaignDecision, BadgeTone> = {
  approve: 'success',
  review: 'warning',
  block: 'danger',
}

const recipientTone: Record<RecipientStatus, BadgeTone> = {
  sent: 'success',
  held: 'warning',
  pending: 'neutral',
}

const campaignTone: Record<string, BadgeTone> = {
  draft: 'neutral',
  ready: 'gold',
  complete: 'success',
  running: 'info',
  paused: 'warning',
}

const templates = [
  ['course-update-v1', 'Course update'],
  ['enrolment-reminder-v1', 'Enrolment reminder'],
  ['scholarship-followup-v1', 'Scholarship follow-up'],
] as const

export function MessageGateApp() {
  const {
    data,
    status,
    error,
    refresh,
    refreshing,
    mode,
    createCampaign,
    previewCampaign,
    executeCampaign,
  } = useDemo()
  const [selectedId, setSelectedId] = useState<string>('')
  const [name, setName] = useState('Autumn course update')
  const [customerId, setCustomerId] = useState('')
  const [templateId, setTemplateId] = useState<string>(templates[0][0])
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedId && data?.campaigns[0]) setSelectedId(data.campaigns[0].id)
  }, [data, selectedId])

  const selected = data?.campaigns.find((campaign) => campaign.id === selectedId)
  const recipients = useMemo(
    () => (data?.campaignRecipients ?? []).filter((recipient) => recipient.campaignId === selectedId),
    [data, selectedId],
  )
  const counts = useMemo(
    () => ({
      approve: recipients.filter((recipient) => recipient.decision === 'approve').length,
      review: recipients.filter((recipient) => recipient.decision === 'review').length,
      block: recipients.filter((recipient) => recipient.decision === 'block').length,
      sent: recipients.filter((recipient) => recipient.status === 'sent').length,
      held: recipients.filter((recipient) => recipient.status === 'held').length,
    }),
    [recipients],
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
        <StateBlock tone="error" title="Message Gate unavailable" description={error ?? 'The workspace could not be loaded.'}>
          <Button variant="gold" onClick={() => void refresh()}>
            Retry
          </Button>
        </StateBlock>
      </div>
    )
  }

  const blocked = data.integrity?.gateState === 'BLOCKED'
  const selectedCustomer = customerId || data.customers[0]?.id || ''

  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key)
    try {
      await action()
    } finally {
      setPending(null)
    }
  }

  const draft = async () => {
    if (mode !== 'api' || !selectedCustomer) return
    await run('create', () =>
      createCampaign({
        name,
        subjectRef: selectedCustomer,
        templateId,
        channel,
        purpose: 'marketing',
      }),
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-gold-soft text-gold-ink">
          <Send className="size-4" strokeWidth={1.8} />
        </span>
        <div>
          <h1 className="text-[12.5px] font-semibold text-ink">Message Gate</h1>
          <p className="text-[9.5px] text-ink-faint">Preview decisions, execute only approved recipients.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={blocked ? 'danger' : 'success'}>{blocked ? 'Dispatch blocked' : 'Dispatch open'}</Badge>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <StatusBanner integrity={data.integrity} />
          <Panel title="Campaigns" description="Drafts are persisted; execution always re-evaluates policy." flush>
            {data.campaigns.length === 0 ? (
              <div className="p-6">
                <StateBlock title="No campaigns yet" description="Draft a campaign to preview the message gate." />
              </div>
            ) : (
              <div className="divide-y divide-line/70">
                {data.campaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => setSelectedId(campaign.id)}
                    className={cn(
                      'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                      selectedId === campaign.id ? 'bg-gold-soft/40' : 'hover:bg-panel-muted/60',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[11px] font-semibold text-ink">{campaign.name}</span>
                        <Badge tone={campaignTone[campaign.status] ?? 'neutral'} className="capitalize">
                          {campaign.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-[9.5px] text-ink-faint">{campaign.message}</p>
                    </div>
                    <span className="shrink-0 text-[9px] text-ink-faint">
                      {formatDateTime(campaign.scheduledFor)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title={selected ? `Recipients · ${selected.name}` : 'Recipients'}
            description="Decision counts come from the persisted policy preview."
            flush
          >
            {!selected ? (
              <div className="p-6">
                <StateBlock title="Select a campaign" description="Choose a campaign to inspect its recipients." />
              </div>
            ) : recipients.length === 0 ? (
              <div className="p-6">
                <StateBlock
                  title="No preview yet"
                  description="Run a preview to evaluate every recipient against the active policy."
                />
              </div>
            ) : (
              <div className="max-h-[360px] overflow-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="sticky top-0 bg-panel-muted text-[8.5px] uppercase tracking-[0.12em] text-ink-faint">
                    <tr>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Decision</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">Delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((recipient) => {
                      const customer = data.customers.find((entry) => entry.id === recipient.customerId)
                      return (
                        <tr key={recipient.id} className="border-t border-line/70 text-[10.5px]">
                          <td className="px-3 py-2">
                            <p className="font-medium text-ink">{customer?.name ?? 'Unknown subject'}</p>
                            <p className="text-[9px] text-ink-faint">{recipient.email || 'masked'}</p>
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={decisionTone[recipient.decision]} className="capitalize">
                              {recipient.decision}
                            </Badge>
                          </td>
                          <td className="max-w-[220px] px-3 py-2 text-[9.5px] text-ink-soft">
                            <span className="line-clamp-2">{recipient.reason}</span>
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={recipientTone[recipient.status]} className="capitalize">
                              {recipient.status}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {selected && recipients.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2 text-[9.5px] text-ink-faint">
                <span>{counts.approve} approved</span>
                <span>{counts.review} review</span>
                <span>{counts.block} blocked</span>
                <span>{counts.sent} sent</span>
                <span>{counts.held} held</span>
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={mode !== 'api' || pending !== null || selected.status === 'complete'}
                    onClick={() => void run('preview', () => previewCampaign(selected.id))}
                  >
                    <Eye className="size-3.5" />
                    Preview
                  </Button>
                  <Button
                    variant="gold"
                    size="sm"
                    disabled={mode !== 'api' || blocked || pending !== null || selected.status !== 'ready'}
                    onClick={() => void run('execute', () => executeCampaign(selected.id))}
                    title={blocked ? 'Managed dispatch is blocked by an evidence integrity incident.' : undefined}
                  >
                    <Send className="size-3.5" />
                    Execute approved
                  </Button>
                </div>
              </div>
            )}
          </Panel>
        </div>

        <aside className="flex w-[330px] shrink-0 flex-col gap-4">
          <Panel title="Draft a campaign" description="Creates a real campaign with recipient records.">
            {mode !== 'api' ? (
              <ApiRequired action="Campaign creation" />
            ) : (
              <div className="space-y-2">
                <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[10.5px] text-ink"
                  />
                </label>
                <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Customer
                  <select
                    value={selectedCustomer}
                    onChange={(event) => setCustomerId(event.target.value)}
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
                    Template
                    <select
                      value={templateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                      className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[10.5px] text-ink"
                    >
                      {templates.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                    Channel
                    <select
                      value={channel}
                      onChange={(event) => setChannel(event.target.value as 'whatsapp' | 'email')}
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
                  disabled={pending !== null || !selectedCustomer}
                  onClick={() => void draft()}
                >
                  {pending === 'create' ? 'Drafting…' : 'Draft campaign'}
                </Button>
              </div>
            )}
          </Panel>

          <Panel title="Outbox" description="Only allowed recipients are queued.">
            <div className="space-y-2 text-[10.5px] text-ink-soft">
              <div className="flex justify-between">
                <span>Sent</span>
                <span className="font-semibold text-ink tnum">{counts.sent}</span>
              </div>
              <div className="flex justify-between">
                <span>Held</span>
                <span className="font-semibold text-ink tnum">{counts.held}</span>
              </div>
              <div className="flex justify-between">
                <span>Pending</span>
                <span className="font-semibold text-ink tnum">
                  {recipients.filter((recipient) => recipient.status === 'pending').length}
                </span>
              </div>
              <p className="border-t border-line pt-2 text-[9.5px] leading-3.5 text-ink-faint">
                No third-party message is sent. The outbox is a persisted mock delivery record.
              </p>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  )
}
