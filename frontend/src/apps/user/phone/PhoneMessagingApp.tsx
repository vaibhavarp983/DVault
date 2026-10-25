import {
  ChevronLeft,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { MessageChannel } from '@/domain/messaging'
import type { UserWorkspace } from '@/domain/user'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useUser } from '@/store/user-provider'
import { Badge } from '@/components/ui/badge'
import { PhoneAppShell } from './PhoneChrome'

export function PhoneMessagingApp({
  workspace,
  channel,
  onBack,
}: {
  workspace: UserWorkspace
  channel: MessageChannel
  onBack: () => void
}) {
  const { sendMessage, markConversationRead, verifyConversation } = useUser()
  const conversations = useMemo(
    () => (workspace.conversations ?? []).filter((entry) => entry.channel === channel),
    [workspace.conversations, channel],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const selected = conversations.find((entry) => entry.id === selectedId)

  useEffect(() => {
    setDraft('')
  }, [selectedId])

  useEffect(() => {
    if (selected && selected.unreadForCustomer > 0) {
      void markConversationRead(selected.id)
    }
  }, [selected?.id])

  const title = channel === 'email' ? 'Mail' : 'Messages'
  const Icon = channel === 'email' ? Mail : MessageSquare

  if (!selected) {
    return (
      <PhoneAppShell
        title={title}
        onBack={onBack}
        action={<Badge tone="gold">{conversations.length}</Badge>}
      >
        <div className="space-y-2 p-3">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => setSelectedId(conversation.id)}
              className="flex w-full items-start gap-2.5 rounded-2xl border border-line bg-panel p-3 text-left shadow-sm transition-colors active:bg-panel-muted"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-ink">
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink">
                    {conversation.subject}
                  </span>
                  <span className="shrink-0 text-[8px] text-ink-faint">
                    {formatRelative(conversation.lastActivityAt)}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[9px] text-ink-soft">
                  {conversation.messages[conversation.messages.length - 1]?.body ??
                    'Content removed by retention policy'}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge tone={conversation.holdActive ? 'gold' : 'neutral'}>
                    {conversation.retentionClass}
                  </Badge>
                  {conversation.unreadForCustomer > 0 && (
                    <Badge tone="gold">{conversation.unreadForCustomer} new</Badge>
                  )}
                  {conversation.integrityState === 'FLAGGED' && (
                    <Badge tone="danger">Flagged</Badge>
                  )}
                </span>
              </span>
            </button>
          ))}
          {conversations.length === 0 && (
            <p className="p-4 text-center text-[10px] text-ink-faint">No conversations yet.</p>
          )}
          <p className="px-1 pt-1 text-[8px] leading-3.5 text-ink-faint">
            Messages share one chain with the business app. In local mode hashes are simulated.
          </p>
        </div>
      </PhoneAppShell>
    )
  }

  return (
    <PhoneAppShell
      title={selected.subject}
      onBack={() => setSelectedId(null)}
      action={
        <button
          type="button"
          onClick={() => void verifyConversation(selected.id)}
          className="flex size-8 items-center justify-center rounded-full text-ink-soft hover:bg-panel-muted"
          aria-label="Verify message chain"
        >
          {selected.integrityState === 'FLAGGED' ? (
            <ShieldAlert className="size-4 text-danger" />
          ) : (
            <ShieldCheck className="size-4 text-success" />
          )}
        </button>
      }
    >
      <div className="flex min-h-full flex-col">
        <div className="border-b border-line bg-panel/60 px-3 py-2">
          <p className="text-[9px] text-ink-faint">
            {selected.customerName} Â· {selected.messageCount} messages
          </p>
          {selected.holdActive && (
            <p className="mt-1 text-[8.5px] text-gold-ink">
              Retention hold active: content is protected from purge.
            </p>
          )}
        </div>
        <div className="flex-1 space-y-2.5 p-3">
          {selected.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'max-w-[85%] rounded-2xl border px-3 py-2',
                message.sender === 'CUSTOMER'
                  ? 'ml-auto border-gold/20 bg-gold-soft/55'
                  : 'border-line bg-panel',
              )}
            >
              <p className="text-[8.5px] font-semibold text-ink-soft">{message.authorLabel}</p>
              <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-ink">
                {message.body ??
                  'Content removed by retention policy. This message hash is still verifiable.'}
              </p>
              <p className="mt-1 text-[7.5px] text-ink-faint">
                {formatDateTime(message.sentAt)} Â· {message.retentionState}
              </p>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 flex items-end gap-1.5 border-t border-line bg-canvas p-2.5">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder={`Reply to ${selected.customerName}â€¦`}
            className="min-h-[38px] flex-1 resize-none rounded-xl border border-line bg-panel px-2.5 py-2 text-[10px] outline-none focus:border-gold/50"
          />
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={async () => {
              const body = draft.trim()
              if (!body) return
              setDraft('')
              await sendMessage(selected.id, body)
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold text-white disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </PhoneAppShell>
  )
}

export function PhoneMailApp(props: {
  workspace: UserWorkspace
  onBack: () => void
}) {
  return <PhoneMessagingApp {...props} channel="email" />
}

export function PhoneMessagesApp(props: {
  workspace: UserWorkspace
  onBack: () => void
}) {
  return <PhoneMessagingApp {...props} channel="chat" />
}

export { ChevronLeft }
