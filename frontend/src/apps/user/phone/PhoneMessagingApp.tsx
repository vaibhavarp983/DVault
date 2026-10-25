import {
  Building2,
  Mail,
  MapPin,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  BIZ_MESSAGE_TEMPLATES,
  BIZ_MESSAGE_TYPES,
  BUSINESS_DIRECTORY,
  businessForConversation,
  normalizeBizCode,
  resolveBizCode,
  type BizBusiness,
} from '@/data/business-directory'
import { isOverlayConversationId } from '@/data/local-messaging-store'
import type { BizMessageType, MessageChannel } from '@/domain/messaging'
import type { UserWorkspace } from '@/domain/user'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useUser } from '@/store/user-provider'
import { useNameSafe } from '@/store/use-name-safe'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PhoneAppShell } from './PhoneChrome'

export function PhoneMessagingApp({
  workspace,
  channel,
  onBack,
  initialBizCode,
  initialMessageType,
}: {
  workspace: UserWorkspace
  channel: MessageChannel
  onBack: () => void
  initialBizCode?: string | null
  initialMessageType?: BizMessageType
}) {
  const { addBizConversation, sendMessage, markConversationRead, verifyConversation, mode } =
    useUser()
  const nameSafe = useNameSafe()
  const conversations = useMemo(
    () => (workspace.conversations ?? []).filter((entry) => entry.channel === channel),
    [workspace.conversations, channel],
  )
  const initialBusiness = useMemo(() => resolveBizCode(initialBizCode), [initialBizCode])
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (!initialBusiness) return null
    return (
      conversations.find(
        (entry) =>
          entry.businessCode === initialBusiness.code && entry.channel === channel,
      )?.id ?? null
    )
  })
  const [adding, setAdding] = useState(() => Boolean(initialBizCode) && !selectedId)
  const [draft, setDraft] = useState('')
  const [bizCode, setBizCode] = useState(() => normalizeBizCode(initialBizCode))
  const [messageType, setMessageType] = useState<BizMessageType>(
    initialMessageType ?? 'GENERAL_ENQUIRY',
  )
  const [body, setBody] = useState(() =>
    initialBusiness
      ? BIZ_MESSAGE_TEMPLATES[initialMessageType ?? 'GENERAL_ENQUIRY'].body(initialBusiness.name)
      : '',
  )
  const [formError, setFormError] = useState(() =>
    initialBizCode && !initialBusiness ? 'That business code was not found.' : '',
  )
  const [sending, setSending] = useState(false)
  const selected = conversations.find((entry) => entry.id === selectedId)
  const selectedBusiness = selected
    ? businessForConversation(selected.businessCode, selected.businessName)
    : null
  const selectedAlias = selected ? nameSafe.aliasFor(selected) : null

  useEffect(() => {
    setDraft('')
  }, [selectedId])

  useEffect(() => {
    if (selected && selected.unreadForCustomer > 0) {
      void markConversationRead(selected.id)
    }
  }, [selected?.id, selected?.unreadForCustomer])

  useEffect(() => {
    if (!adding) return
    const business = resolveBizCode(bizCode)
    if (!business) return
    setBody(BIZ_MESSAGE_TEMPLATES[messageType].body(business.name))
  }, [adding, bizCode, messageType])

  const title = channel === 'email' ? 'Mail' : 'Messages'
  const Icon = channel === 'email' ? Mail : MessageSquare

  const openAdd = () => {
    setAdding(true)
    setBizCode('')
    setMessageType('GENERAL_ENQUIRY')
    setBody('')
    setFormError('')
  }

  const closeAdd = () => {
    if (sending) return
    setAdding(false)
    setFormError('')
  }

  const submitBiz = async () => {
    const business = resolveBizCode(bizCode)
    if (!business) {
      setFormError('That business code was not found.')
      return
    }
    if (!body.trim()) {
      setFormError('Add a message to start the conversation.')
      return
    }
    setSending(true)
    setFormError('')
    const template = BIZ_MESSAGE_TEMPLATES[messageType]
    const id = await addBizConversation({
      bizCode: business.code,
      channel,
      messageType,
      subject: template.subject,
      body: body.trim(),
    })
    setSending(false)
    if (!id) return
    setAdding(false)
    setBizCode('')
    setBody('')
    setSelectedId(id)
  }

  if (!selected) {
    return (
      <PhoneAppShell
        title={title}
        onBack={onBack}
        action={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={openAdd}
              className="flex size-8 items-center justify-center rounded-full bg-gold-soft text-gold-ink transition-colors hover:bg-gold/25"
              aria-label={`Add a business to ${title}`}
            >
              <Plus className="size-4" strokeWidth={2.4} />
            </button>
            <Badge tone="gold">{conversations.length}</Badge>
          </div>
        }
        overlay={
          adding ? (
            <BizCodeSheet
              channel={channel}
              bizCode={bizCode}
              onBizCode={(value) => {
                setBizCode(normalizeBizCode(value))
                setFormError('')
              }}
              messageType={messageType}
              onMessageType={setMessageType}
              body={body}
              onBody={setBody}
              business={resolveBizCode(bizCode)}
              error={formError}
              sending={sending}
              onClose={closeAdd}
              onSubmit={() => void submitBiz()}
            />
          ) : undefined
        }
      >
        <div className="space-y-2 p-3">
          {conversations.map((conversation) => {
            const business = businessForConversation(
              conversation.businessCode,
              conversation.businessName,
            )
            const typeLabel = conversation.messageType
              ? BIZ_MESSAGE_TEMPLATES[conversation.messageType].label
              : null
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedId(conversation.id)}
                className="flex w-full items-start gap-2.5 rounded-2xl border border-line bg-panel p-3 text-left shadow-sm transition-colors active:bg-panel-muted"
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-semibold text-white shadow-inner"
                  style={{
                    backgroundImage: `linear-gradient(140deg, ${business.accentFrom}, ${business.accentTo})`,
                  }}
                >
                  {business.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink">
                      {business.name}
                    </span>
                    <span className="shrink-0 text-[8px] text-ink-faint">
                      {formatRelative(conversation.lastActivityAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[9px] font-medium text-ink-soft">
                    {conversation.subject}
                  </span>
                  <span className="mt-0.5 block truncate text-[9px] text-ink-soft">
                    {conversation.messages[conversation.messages.length - 1]?.body ??
                      'Content removed by retention policy'}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    {typeLabel && <Badge tone="outline">{typeLabel}</Badge>}
                    {mode === 'api' && isOverlayConversationId(conversation.id) && (
                      <Badge tone="outline">Session-only</Badge>
                    )}
                    {conversation.unreadForCustomer > 0 && (
                      <Badge tone="gold">{conversation.unreadForCustomer} new</Badge>
                    )}
                    {conversation.integrityState === 'FLAGGED' && (
                      <Badge tone="danger">Flagged</Badge>
                    )}
                  </span>
                </span>
              </button>
            )
          })}
          {conversations.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center">
              <Icon className="mx-auto size-6 text-ink-faint" />
              <p className="mt-2 text-[10px] font-medium text-ink">No conversations yet.</p>
              <p className="mt-1 text-[8.5px] leading-4 text-ink-faint">
                Tap + and enter a business code to start a chat or mail.
              </p>
            </div>
          )}
          <p className="px-1 pt-1 text-[8px] leading-3.5 text-ink-faint">
            Business messages are shared live with the desktop portal. Add a code to start.
          </p>
        </div>
      </PhoneAppShell>
    )
  }

  return (
    <PhoneAppShell
      title={selectedBusiness?.name ?? selected.subject}
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
        <div className="border-b border-line bg-panel/60 px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-semibold text-white"
              style={{
                backgroundImage: `linear-gradient(140deg, ${selectedBusiness?.accentFrom ?? '#c19440'}, ${selectedBusiness?.accentTo ?? '#8a6521'})`,
              }}
            >
              {selectedBusiness?.initials ?? <Building2 className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="min-w-0 flex-1 truncate text-[10.5px] font-semibold text-ink">
                  {selectedBusiness?.name ?? selected.businessName}
                </p>
                {selected.messageType && (
                  <Badge tone="gold">{BIZ_MESSAGE_TEMPLATES[selected.messageType].label}</Badge>
                )}
                {mode === 'api' && isOverlayConversationId(selected.id) && (
                  <Badge tone="outline">Session-only</Badge>
                )}
              </div>
              <p className="truncate text-[8.5px] text-ink-soft">
                {selectedBusiness?.category} · ★ {selectedBusiness?.rating.toFixed(1)}
              </p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-[8px] text-ink-faint">
                <MapPin className="size-2.5 shrink-0" />
                {selectedBusiness?.address}
              </p>
              {selectedAlias && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-[8px] font-medium text-gold-ink">
                  <ShieldCheck className="size-2.5 shrink-0" />
                  Business sees {selectedAlias}
                </p>
              )}
            </div>
          </div>
          {selected.holdActive && (
            <p className="mt-1.5 text-[8.5px] text-gold-ink">
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
                {formatDateTime(message.sentAt)} · {message.retentionState}
              </p>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 flex items-end gap-1.5 border-t border-line bg-canvas p-2.5">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder={`Reply to ${selectedBusiness?.name ?? 'the business'}…`}
            className="min-h-[38px] flex-1 resize-none rounded-xl border border-line bg-panel px-2.5 py-2 text-[10px] outline-none focus:border-gold/50"
          />
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={async () => {
              const value = draft.trim()
              if (!value) return
              setDraft('')
              await sendMessage(selected.id, value)
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

function BizCodeSheet({
  channel,
  bizCode,
  onBizCode,
  messageType,
  onMessageType,
  body,
  onBody,
  business,
  error,
  sending,
  onClose,
  onSubmit,
}: {
  channel: MessageChannel
  bizCode: string
  onBizCode: (value: string) => void
  messageType: BizMessageType
  onMessageType: (value: BizMessageType) => void
  body: string
  onBody: (value: string) => void
  business: BizBusiness | null
  error: string
  sending: boolean
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/35 backdrop-blur-[1px]">
      <div className="max-h-[88%] w-full overflow-y-auto rounded-t-[24px] border-t border-line bg-canvas p-3 pb-5 shadow-[0_-18px_40px_-20px_rgba(20,18,14,0.45)]">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-ink">
              {channel === 'email' ? 'Mail a business' : 'Chat with a business'}
            </p>
            <p className="text-[8.5px] text-ink-faint">Add a biz code to continue</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="flex size-7 items-center justify-center rounded-full text-ink-soft hover:bg-panel-muted disabled:opacity-40"
            aria-label="Close add business"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <label className="mt-3 block text-[8.5px] font-medium text-ink-faint">
          Business code
          <input
            value={bizCode}
            onChange={(event) => onBizCode(event.target.value)}
            placeholder="e.g. BIZ-SWA001"
            autoCapitalize="characters"
            spellCheck={false}
            className="mt-1 h-9 w-full rounded-xl border border-line bg-panel px-3 text-[11px] font-semibold tracking-wide text-ink outline-none placeholder:font-normal placeholder:tracking-normal focus:border-gold/50"
          />
        </label>

        <div className="scroll-thin mt-1.5 flex gap-1 overflow-x-auto pb-1">
          {BUSINESS_DIRECTORY.map((entry) => (
            <button
              key={entry.code}
              type="button"
              onClick={() => onBizCode(entry.code)}
              className="shrink-0 rounded-full border border-line bg-panel px-2 py-1 text-[8px] font-medium text-ink-soft hover:border-gold/40 hover:text-gold-ink"
            >
              {entry.code}
            </button>
          ))}
        </div>

        {business ? (
          <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-gold/20 bg-gold-soft/35 p-2.5">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-semibold text-white"
              style={{
                backgroundImage: `linear-gradient(140deg, ${business.accentFrom}, ${business.accentTo})`,
              }}
            >
              {business.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10.5px] font-semibold text-ink">{business.name}</p>
              <p className="truncate text-[8.5px] text-ink-soft">
                {business.category} · ★ {business.rating.toFixed(1)} ({business.reviews})
              </p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-[8px] text-ink-faint">
                <MapPin className="size-2.5 shrink-0" />
                {business.directions ?? business.address}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[8.5px] text-ink-faint">
            Enter one of the hardcoded business codes to see the business name.
          </p>
        )}

        {error && (
          <p className="mt-2 rounded-lg border border-danger/20 bg-danger/5 px-2 py-1.5 text-[9px] text-danger">
            {error}
          </p>
        )}

        <label className="mt-3 block text-[8.5px] font-medium text-ink-faint">
          What is this about?
          <select
            value={messageType}
            onChange={(event) => onMessageType(event.target.value as BizMessageType)}
            className="mt-1 h-9 w-full rounded-xl border border-line bg-panel px-2 text-[10px] text-ink outline-none focus:border-gold/50"
          >
            {BIZ_MESSAGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {BIZ_MESSAGE_TEMPLATES[type].label}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-2 block text-[8.5px] font-medium text-ink-faint">
          Message
          <textarea
            value={body}
            onChange={(event) => onBody(event.target.value)}
            rows={3}
            placeholder="Write your message…"
            className="mt-1 w-full resize-none rounded-xl border border-line bg-panel px-3 py-2 text-[10px] leading-4 text-ink outline-none focus:border-gold/50"
          />
        </label>

        <div className="mt-3 flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            variant="gold"
            size="sm"
            className="flex-1"
            onClick={onSubmit}
            disabled={sending || !business}
          >
            {sending ? 'Sending…' : channel === 'email' ? 'Send mail' : 'Start chat'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PhoneMailApp(props: {
  workspace: UserWorkspace
  onBack: () => void
  initialBizCode?: string | null
  initialMessageType?: BizMessageType
}) {
  return <PhoneMessagingApp {...props} channel="email" />
}

export function PhoneMessagesApp(props: {
  workspace: UserWorkspace
  onBack: () => void
  initialBizCode?: string | null
  initialMessageType?: BizMessageType
}) {
  return <PhoneMessagingApp {...props} channel="chat" />
}
