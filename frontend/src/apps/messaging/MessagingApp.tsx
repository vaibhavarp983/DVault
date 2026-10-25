import {
  Archive,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquare,
  PenLine,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  ARANYA_BUSINESS,
  BIZ_MESSAGE_TEMPLATES,
  BUSINESS_ACCOUNTS,
  resolveBizCode,
} from '@/data/business-directory'
import type {
  Conversation,
  MessageChannel,
  RetentionAction,
  WithdrawalEffect,
} from '@/domain/messaging'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import type { WindowPayload } from '@/store/window-provider'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/state-block'

const interactionTone: Record<string, BadgeTone> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'neutral',
}

const retentionTone: Record<string, BadgeTone> = {
  FULL: 'success',
  MIXED: 'warning',
  METADATA: 'gold',
  PURGED: 'danger',
}

export function MessagingApp({
  channel,
  payload,
}: {
  channel: MessageChannel
  payload?: WindowPayload
}) {
  const {
    data,
    status,
    refreshing,
    createConversation,
    sendMessage,
    markConversationRead,
    archiveConversation,
    verifyConversation,
    verifyMessages,
    runRetention,
    updateRetentionPolicy,
    updateWithdrawalTier,
  } = useDemo()
  const farFuture = useMemo(() => new Date(Date.now() + 86_400_000), [])
  void farFuture
  const [actingAsCode, setActingAsCode] = useState(ARANYA_BUSINESS.code)
  const actingAs = resolveBizCode(actingAsCode) ?? ARANYA_BUSINESS
  const conversations = useMemo(
    () =>
      (data?.conversations ?? []).filter(
        (entry) =>
          entry.channel === channel &&
          (entry.businessCode ?? ARANYA_BUSINESS.code) === actingAsCode,
      ),
    [data?.conversations, channel, actingAsCode],
  )
  const unreadByBusiness = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of data?.conversations ?? []) {
      if (entry.channel !== channel) continue
      const code = entry.businessCode ?? ARANYA_BUSINESS.code
      counts.set(code, (counts.get(code) ?? 0) + entry.unreadForBusiness)
    }
    return counts
  }, [data?.conversations, channel])
  const businessUnread = unreadByBusiness.get(actingAsCode) ?? 0
  const totalUnread = Array.from(unreadByBusiness.values()).reduce(
    (total, count) => total + count,
    0,
  )
  const [selectedId, setSelectedId] = useState<string | null>(payload?.conversationId ?? null)
  const [panel, setPanel] = useState<'threads' | 'controls'>(
    payload?.panel === 'controls' ? 'controls' : 'threads',
  )
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newCustomer, setNewCustomer] = useState('')
  const [newBody, setNewBody] = useState('')

  const selected =
    conversations.find((entry) => entry.id === selectedId) ??
    conversations.find((entry) => entry.id === payload?.conversationId) ??
    conversations[0]

  useEffect(() => {
    if (payload?.conversationId) {
      setSelectedId(payload.conversationId)
      setPanel('threads')
    }
  }, [payload?.conversationId])

  useEffect(() => {
    if (payload?.panel) setPanel(payload.panel)
  }, [payload?.panel])

  useEffect(() => {
    if (!selected) return
    if (selected.unreadForBusiness > 0) void markConversationRead(selected.id)
    setSelectedId(selected.id)
  }, [selected?.id, selected?.unreadForBusiness])

  useEffect(() => {
    setDraft('')
    setComposing(false)
  }, [selected?.id])

  if (status === 'loading' || (status === 'ready' && !data)) {
    return (
      <div className="flex h-full gap-0 bg-canvas">
        <div className="w-[320px] space-y-2 border-r border-line bg-surface p-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-ink-soft">
        The communication workspace is unavailable.
      </div>
    )
  }

  const submitReply = async () => {
    if (!selected || !draft.trim()) return
    const body = draft.trim()
    setDraft('')
    await sendMessage(selected.id, body)
  }

  const submitNew = async () => {
    if (!newCustomer.trim() || !newBody.trim()) return
    await createConversation({
      subjectRef: newCustomer.trim(),
      channel,
      subject: newSubject.trim(),
      body: newBody.trim(),
      businessCode: actingAsCode,
      businessName: actingAs.name,
    })
    setComposing(false)
    setNewCustomer('')
    setNewSubject('')
    setNewBody('')
  }

  const verify = () => {
    if (!selected) return
    void verifyConversation(selected.id)
  }

  return (
    <div className="flex h-full min-h-0 bg-canvas">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
          <span className="flex size-7 items-center justify-center rounded-md bg-gold-soft text-gold-ink">
            {channel === 'email' ? <Mail className="size-4" /> : <MessageSquare className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-ink">
              {channel === 'email' ? 'Mail' : 'Messages'}
            </p>
            <p className="text-[9px] text-ink-faint">
              {conversations.length} {conversations.length === 1 ? 'thread' : 'threads'}
            </p>
          </div>
          <Button variant="gold" size="sm" onClick={() => setComposing((current) => !current)}>
            <PenLine className="size-3.5" /> New
          </Button>
        </div>

        <div className="flex items-center gap-2 border-b border-line bg-panel/60 px-3 py-2">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-[9px] font-semibold text-white"
            style={{
              backgroundImage: `linear-gradient(140deg, ${actingAs.accentFrom}, ${actingAs.accentTo})`,
            }}
          >
            {actingAs.initials}
          </span>
          <label className="min-w-0 flex-1">
            <span className="block text-[8px] uppercase tracking-[0.14em] text-ink-faint">
              Acting as
            </span>
            <select
              value={actingAsCode}
              onChange={(event) => setActingAsCode(event.target.value)}
              className="mt-0.5 w-full truncate border-0 bg-transparent p-0 text-[10.5px] font-semibold text-ink outline-none"
            >
              {BUSINESS_ACCOUNTS.map((business) => {
                const unread = unreadByBusiness.get(business.code) ?? 0
                return (
                  <option key={business.code} value={business.code}>
                    {business.name}
                    {unread > 0 ? ` · ${unread} unread` : ''}
                  </option>
                )
              })}
            </select>
          </label>
          <span className="shrink-0 text-[9px] text-ink-faint">
            {businessUnread > 0
              ? `${businessUnread} unread`
              : totalUnread > 0
                ? `${totalUnread} unread elsewhere`
                : 'All read'}
          </span>
        </div>

        <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
          <button
            type="button"
            onClick={() => setPanel('threads')}
            className={cn(
              'rounded px-2 py-1 text-[10px] font-medium',
              panel === 'threads' ? 'bg-panel-muted text-ink' : 'text-ink-soft hover:text-ink',
            )}
          >
            Threads
          </button>
          <button
            type="button"
            onClick={() => setPanel('controls')}
            className={cn(
              'rounded px-2 py-1 text-[10px] font-medium',
              panel === 'controls' ? 'bg-panel-muted text-ink' : 'text-ink-soft hover:text-ink',
            )}
          >
            Retention & tiers
          </button>
          <span className="ml-auto text-[9px] text-ink-faint">
            {data.messageIntegrity?.status === 'FLAGGED' ? 'Chain flagged' : 'Chain verified'}
          </span>
        </div>

        {composing && (
          <div className="space-y-2 border-b border-line bg-panel p-3">
            <input
              value={newCustomer}
              onChange={(event) => setNewCustomer(event.target.value)}
              placeholder="Customer subject ref"
              className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[11px] outline-none focus:border-gold/50"
            />
            <input
              value={newSubject}
              onChange={(event) => setNewSubject(event.target.value)}
              placeholder={channel === 'email' ? 'Email subject' : 'Chat topic'}
              className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[11px] outline-none focus:border-gold/50"
            />
            <textarea
              value={newBody}
              onChange={(event) => setNewBody(event.target.value)}
              rows={3}
              placeholder="First message"
              className="w-full resize-none rounded-md border border-line bg-surface px-2 py-1.5 text-[11px] outline-none focus:border-gold/50"
            />
            <div className="flex justify-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>
                Cancel
              </Button>
              <Button variant="gold" size="sm" onClick={() => void submitNew()}>
                Start thread
              </Button>
            </div>
          </div>
        )}

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {panel === 'threads' &&
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setSelectedId(conversation.id)
                  setPanel('threads')
                }}
                className={cn(
                  'flex w-full flex-col gap-1 border-b border-line/70 px-3 py-2.5 text-left transition-colors',
                  selected?.id === conversation.id ? 'bg-gold-soft/45' : 'hover:bg-panel-muted/70',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-ink">
                    {conversation.customerName}
                  </span>
                  <span className="shrink-0 text-[9px] text-ink-faint">
                    {formatRelative(conversation.lastActivityAt)}
                  </span>
                </div>
                <span className="truncate text-[10px] text-ink-soft">{conversation.subject}</span>
                <div className="flex items-center gap-1.5">
                  <Badge tone={interactionTone[conversation.interactionLevel] ?? 'neutral'}>
                    {conversation.interactionLevel}
                  </Badge>
                  <Badge tone={retentionTone[conversation.retentionClass] ?? 'neutral'}>
                    {conversation.retentionClass}
                  </Badge>
                  {conversation.messageType && (
                    <Badge tone="gold">{BIZ_MESSAGE_TEMPLATES[conversation.messageType].label}</Badge>
                  )}
                  {conversation.holdActive && <Badge tone="gold">Hold</Badge>}
                  {conversation.unreadForBusiness > 0 && (
                    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-semibold text-white">
                      {conversation.unreadForBusiness}
                    </span>
                  )}
                </div>
              </button>
            ))}
          {panel === 'threads' && conversations.length === 0 && (
            <p className="p-4 text-center text-[11px] text-ink-faint">
              No {channel === 'email' ? 'mail' : 'chat'} threads for {actingAs.name} yet.
            </p>
          )}
          {panel === 'controls' && (
            <RetentionControls
              onRun={() => void runRetention()}
              onVerify={() => void verifyMessages()}
              onPolicy={(payload) => void updateRetentionPolicy(payload)}
              onTier={(key, payload) => void updateWithdrawalTier(key, payload)}
              busy={refreshing}
            />
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-faint">
            <Mail className="size-8 opacity-40" />
            <p className="text-[12px]">Choose a thread to begin.</p>
          </div>
        ) : (
          <>
            <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[13px] font-semibold text-ink">{selected.subject}</h2>
                  <Badge tone={selected.integrityState === 'FLAGGED' ? 'danger' : 'success'} dot>
                    {selected.integrityState === 'FLAGGED' ? 'Tamper flag' : 'Verified chain'}
                  </Badge>
                  {selected.messageType && (
                    <Badge tone="gold">{BIZ_MESSAGE_TEMPLATES[selected.messageType].label}</Badge>
                  )}
                  {selected.holdActive && <Badge tone="gold">Retention hold</Badge>}
                </div>
                <p className="mt-0.5 truncate text-[10px] text-ink-faint">
                  {selected.customerName} · {selected.channel} · {selected.messageCount} messages ·
                  last activity {formatDateTime(selected.lastActivityAt)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={verify}>
                <ShieldCheck className="size-3.5" /> Verify
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void archiveConversation(selected.id)}
              >
                <Archive className="size-3.5" />
                {selected.status === 'ARCHIVED' ? 'Reopen' : 'Archive'}
              </Button>
            </header>

            {selected.holdActive && (
              <div className="flex items-center gap-2 border-b border-gold/20 bg-gold-soft/45 px-4 py-2 text-[10px] text-gold-ink">
                <ShieldAlert className="size-3.5" /> Active retention hold: this thread is excluded
                from purge and metadata stripping.
              </div>
            )}

            <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas p-4">
              {selected.messages.map((message) => (
                <article
                  key={message.id}
                  className={cn(
                    'max-w-[78%] rounded-xl border px-3.5 py-2.5 shadow-sm',
                    message.sender === 'BUSINESS'
                      ? 'ml-auto border-gold/20 bg-gold-soft/50'
                      : 'border-line bg-panel',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-semibold text-ink">
                      {message.authorLabel}
                    </span>
                    <span className="text-[9px] text-ink-faint">
                      {formatDateTime(message.sentAt)}
                    </span>
                    <Badge tone={retentionTone[message.retentionState] ?? 'neutral'}>
                      {message.retentionState}
                    </Badge>
                    {message.tamperState !== 'VERIFIED' && (
                      <Badge tone="danger">Tampered</Badge>
                    )}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-5 text-ink-soft">
                    {message.body ??
                      'Content removed by retention policy. Hashes and chain position are retained.'}
                  </p>
                  <p className="mt-2 truncate font-mono text-[8px] text-ink-faint">
                    {message.messageHash.slice(0, 24)}… ← {message.previousHash.slice(0, 12)}…
                  </p>
                </article>
              ))}
            </div>

            <footer className="shrink-0 border-t border-line bg-surface p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void submitReply()
                    }
                  }}
                  rows={2}
                  placeholder={
                    selected.status === 'ARCHIVED'
                      ? 'Reopen the thread before replying'
                      : `Reply as ${channel === 'email' ? 'email' : 'chat'}…`
                  }
                  disabled={selected.status === 'ARCHIVED'}
                  className="min-h-[44px] flex-1 resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-[11px] outline-none focus:border-gold/50 disabled:opacity-50"
                />
                <Button
                  variant="gold"
                  size="sm"
                  disabled={!draft.trim() || selected.status === 'ARCHIVED' || refreshing}
                  onClick={() => void submitReply()}
                  className="h-11"
                >
                  <Send className="size-3.5" /> Send
                </Button>
              </div>
              <p className="mt-1.5 text-[9px] text-ink-faint">
                Each message is appended to a per-thread hash chain. Dispatch is recorded even when a
                retention hold keeps content.
              </p>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}

function RetentionControls({
  onRun,
  onVerify,
  onPolicy,
  onTier,
  busy,
}: {
  onRun: () => void
  onVerify: () => void
  onPolicy: (payload: {
    activeDays: number
    mediumDays: number
    highMinMessages: number
    mediumMinMessages: number
    actions: Record<string, RetentionAction>
  }) => void
  onTier: (
    key: string,
    payload: { effect: WithdrawalEffect; active: boolean },
  ) => void
  busy: boolean
}) {
  const { data } = useDemo()
  const [activeDays, setActiveDays] = useState(data?.retentionPolicy?.activeDays ?? 14)
  const [mediumDays, setMediumDays] = useState(data?.retentionPolicy?.mediumDays ?? 90)
  const run = data?.retentionRuns?.[0]

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-lg border border-line bg-panel p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
            <SlidersHorizontal className="size-3.5 text-gold-ink" /> Retention policy
          </p>
          <Badge tone="outline">v{data?.retentionPolicy?.version ?? 1}</Badge>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[9px] text-ink-faint">
            Active days
            <input
              type="number"
              value={activeDays}
              onChange={(event) => setActiveDays(Number(event.target.value))}
              className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-[11px] text-ink"
            />
          </label>
          <label className="text-[9px] text-ink-faint">
            Medium days
            <input
              type="number"
              value={mediumDays}
              onChange={(event) => setMediumDays(Number(event.target.value))}
              className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-[11px] text-ink"
            />
          </label>
        </div>
        <Button
          variant="gold"
          size="sm"
          className="mt-2 w-full"
          disabled={busy}
          onClick={() =>
            onPolicy({
              activeDays,
              mediumDays,
              highMinMessages: data?.retentionPolicy?.highMinMessages ?? 5,
              mediumMinMessages: data?.retentionPolicy?.mediumMinMessages ?? 2,
              actions: data?.retentionPolicy?.actions ?? {
                HIGH: 'FULL',
                MEDIUM: 'METADATA',
                LOW: 'PURGED',
              },
            })
          }
        >
          Save policy version
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-panel p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
          <Trash2 className="size-3.5 text-gold-ink" /> Sweep
        </p>
        <p className="mt-1 text-[9px] leading-4 text-ink-faint">
          HIGH keeps full content. MEDIUM removes body and keeps hashes. LOW purges body. Active
          holds are skipped.
        </p>
        <div className="mt-2 flex gap-1.5">
          <Button variant="outline" size="sm" disabled={busy} onClick={onRun}>
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} /> Run retention
          </Button>
          <Button variant="ghost" size="sm" onClick={onVerify}>
            <ShieldCheck className="size-3.5" /> Verify all
          </Button>
        </div>
        {run && (
          <div className="mt-2 rounded-md border border-line bg-surface px-2 py-1.5 text-[9px] text-ink-soft">
            <p className="flex items-center gap-1">
              <Clock3 className="size-3" /> {run.trigger} · {formatDateTime(run.startedAt)}
            </p>
            <p className="mt-0.5">
              {run.scanned} scanned · {run.reduced} reduced · {run.purged} purged ·{' '}
              {run.skippedHold} hold-protected
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-panel p-3">
        <p className="text-[11px] font-semibold text-ink">Withdrawal tiers</p>
        <div className="mt-2 space-y-1.5">
          {(data?.withdrawalTiers ?? []).map((tier) => (
            <div key={tier.key} className="rounded-md border border-line bg-surface p-2">
              <div className="flex items-center gap-1.5">
                <p className="min-w-0 flex-1 truncate text-[10px] font-medium text-ink">
                  {tier.label}
                </p>
                <Badge tone={tier.active ? 'success' : 'neutral'}>
                  {tier.active ? 'Active' : 'Off'}
                </Badge>
              </div>
              <p className="mt-0.5 text-[8.5px] text-ink-faint">{tier.description}</p>
              <select
                value={tier.effect}
                onChange={(event) =>
                  onTier(tier.key, {
                    effect: event.target.value as WithdrawalEffect,
                    active: tier.active,
                  })
                }
                className="mt-1.5 h-7 w-full rounded border border-line bg-panel px-1.5 text-[9.5px] text-ink"
              >
                <option value="KEEP_ALL">KEEP_ALL</option>
                <option value="REDUCE_LOW">REDUCE_LOW</option>
                <option value="PURGE_LOW_MEDIUM">PURGE_LOW_MEDIUM</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-line bg-panel-muted p-2.5 text-[9px] leading-4 text-ink-faint">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-gold-ink" />
        Local mode hashes are simulated (FNV-based). Switch to API mode for server-verified
        SHA-256 chains.
      </div>
    </div>
  )
}

export function MailApp({ payload }: { payload?: WindowPayload }) {
  return <MessagingApp channel="email" payload={payload} />
}

export function MessagesApp({ payload }: { payload?: WindowPayload }) {
  return <MessagingApp channel="chat" payload={payload} />
}

export function conversationChannelIcon(channel: MessageChannel) {
  return channel === 'email' ? Mail : MessageSquare
}

export function conversationState(conversation: Conversation) {
  return conversation.integrityState === 'FLAGGED' ? (
    <CheckCircle2 className="size-3 text-danger" />
  ) : (
    <ShieldCheck className="size-3 text-success" />
  )
}
