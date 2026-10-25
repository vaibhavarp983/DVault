import type { DemoData } from '@/domain/types'
import type {
  Conversation,
  ConversationDraft,
  ConversationMessage,
  InteractionLevel,
  MessageChannel,
  MessageIntegrity,
  MessageSender,
  RetentionAction,
  RetentionPolicy,
  RetentionPolicyDraft,
  RetentionRun,
  WithdrawalEffect,
  WithdrawalTier,
  WithdrawalTierKey,
} from '@/domain/messaging'
import { GENESIS_HASH, simulatedHash, simulatedMessageHash } from '@/lib/integrity'

export const LOCAL_BUSINESS_LABEL = 'Aranya Coaching Centre'
export const LOCAL_DEMO_SUBJECT = 'usr-rowan'
export const LOCAL_SECONDARY_SUBJECT = 'SUBJ-DEMO-UNHELD'
const LOCAL_WORKSPACE_ID = 'local-workspace'

interface LocalMessagingState {
  conversations: Conversation[]
  policy: RetentionPolicy
  tiers: WithdrawalTier[]
  runs: RetentionRun[]
}

let idCounter = 0

const DAY = 86_400_000

function ago(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString()
}

function defaultTiers(): WithdrawalTier[] {
  return [
    {
      id: 'tier-marketing-only',
      key: 'marketing-only',
      label: 'Marketing only',
      description: 'Stop marketing and analytics use. Conversation content is retained.',
      purposes: ['marketing', 'analytics'],
      effect: 'KEEP_ALL',
      displayOrder: 0,
      active: true,
      version: 1,
      updatedAt: ago(30),
    },
    {
      id: 'tier-all-optional',
      key: 'all-optional',
      label: 'All optional consent',
      description: 'Withdraw every optional purpose and reduce low-interaction message content.',
      purposes: ['marketing', 'course_updates', 'analytics'],
      effect: 'REDUCE_LOW',
      displayOrder: 1,
      active: true,
      version: 1,
      updatedAt: ago(30),
    },
    {
      id: 'tier-full-withdrawal',
      key: 'full-withdrawal',
      label: 'Full optional withdrawal',
      description:
        'Withdraw every optional purpose and remove low and medium-interaction message content.',
      purposes: ['marketing', 'course_updates', 'analytics'],
      effect: 'PURGE_LOW_MEDIUM',
      displayOrder: 2,
      active: true,
      version: 1,
      updatedAt: ago(30),
    },
  ]
}

function defaultPolicy(): RetentionPolicy {
  return {
    id: 'policy-local-retention',
    version: 1,
    active: true,
    activeDays: 14,
    mediumDays: 90,
    highMinMessages: 5,
    mediumMinMessages: 2,
    actions: { HIGH: 'FULL', MEDIUM: 'METADATA', LOW: 'PURGED' },
    updatedAt: ago(30),
  }
}

function createState(): LocalMessagingState {
  const state: LocalMessagingState = {
    conversations: [],
    policy: defaultPolicy(),
    tiers: defaultTiers(),
    runs: [],
  }

  const seedConversation = (
    subjectRef: string,
    customerName: string,
    channel: MessageChannel,
    subject: string,
    holdActive: boolean,
    messages: Array<{ sender: MessageSender; body: string; days: number; subject?: string }>,
  ) => {
    const conversation: Conversation = {
      id: nextId(`conv-${subjectRef.replace(/[^a-z0-9]/gi, '').slice(-6)}-${channel}`),
      subjectRef,
      customerName,
      channel,
      subject,
      status: 'OPEN',
      interactionLevel: 'HIGH',
      retentionClass: 'FULL',
      integrityState: 'VERIFIED',
      holdActive,
      unreadForBusiness: 0,
      unreadForCustomer: 0,
      messageCount: 0,
      lastActivityAt: ago(0),
      createdAt: ago(Math.max(...messages.map((entry) => entry.days))),
      messages: [],
    }
    state.conversations.push(conversation)
    for (const entry of messages) {
      appendMessage(conversation, entry.sender, entry.body, entry.days, entry.subject)
    }
    return conversation
  }

  seedConversation(
    LOCAL_DEMO_SUBJECT,
    'Rowan Ellis',
    'email',
    'August batch schedule',
    true,
    [
      {
        sender: 'BUSINESS',
        body: 'Hello! The August batch timetable is now available. Let us know if the evening slot works for you.',
        days: 9,
      },
      {
        sender: 'CUSTOMER',
        body: 'Evening works. Could you share the reading list before Monday?',
        days: 8,
      },
      {
        sender: 'BUSINESS',
        body: 'Absolutely. I have attached the reading list and the first-week plan.',
        days: 6,
      },
    ],
  )
  seedConversation(LOCAL_DEMO_SUBJECT, 'Rowan Ellis', 'chat', 'Fees receipt', true, [
    { sender: 'BUSINESS', body: 'Your fee receipt for the current term is ready.', days: 3 },
    { sender: 'CUSTOMER', body: 'Got it, thank you!', days: 1 },
  ])
  seedConversation(
    LOCAL_SECONDARY_SUBJECT,
    'Rohan Verma',
    'email',
    'Course brochure request',
    false,
    [
      {
        sender: 'BUSINESS',
        body: 'Sharing the course brochure you requested. Do let us know if you would like a call.',
        days: 120,
      },
    ],
  )
  seedConversation(LOCAL_SECONDARY_SUBJECT, 'Rohan Verma', 'chat', 'Weekend batch questions', false, [
    {
      sender: 'BUSINESS',
      body: 'The weekend batch has two seats left. Would you like the syllabus?',
      days: 20,
    },
    { sender: 'CUSTOMER', body: 'Yes please. Is the fee the same as the weekday batch?', days: 18 },
    {
      sender: 'BUSINESS',
      body: 'The fee is slightly lower and includes the practice workbook.',
      days: 16,
    },
  ])
  seedConversation(
    LOCAL_SECONDARY_SUBJECT,
    'Rohan Verma',
    'email',
    'Placement follow-up',
    false,
    [
      {
        sender: 'BUSINESS',
        body: 'Checking in after the assessment. Your results are ready for review.',
        days: 10,
      },
      {
        sender: 'CUSTOMER',
        body: 'Thanks. I would like to discuss the feedback this week.',
        days: 8,
      },
      {
        sender: 'BUSINESS',
        body: 'Of course. I can do Thursday after 5pm or Friday morning.',
        days: 6,
      },
      { sender: 'CUSTOMER', body: 'Thursday after 5pm works for me.', days: 4 },
      { sender: 'BUSINESS', body: 'Booked. I will send the meeting link separately.', days: 2 },
    ],
  )

  for (const conversation of state.conversations) refreshMetrics(conversation, state.policy)
  return state
}

let state: LocalMessagingState = createState()

export function resetLocalMessagingStore(): void {
  idCounter = 0
  state = createState()
}

function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function appendMessage(
  conversation: Conversation,
  sender: MessageSender,
  body: string,
  days: number,
  subjectLine?: string,
): ConversationMessage {
  const sentAt = ago(days)
  const previous = conversation.messages[conversation.messages.length - 1]
  const messageId = nextId('msg')
  const subject = subjectLine ?? conversation.subject
  const bodySha256 = simulatedHash(body)
  const subjectSha256 = simulatedHash(subject)
  const previousHash = previous?.messageHash ?? GENESIS_HASH
  const message: ConversationMessage = {
    id: messageId,
    conversationId: conversation.id,
    sequence: conversation.messages.length + 1,
    direction: sender === 'BUSINESS' ? 'OUTBOUND' : sender === 'CUSTOMER' ? 'INBOUND' : 'OUTBOUND',
    sender,
    authorLabel:
      sender === 'BUSINESS'
        ? LOCAL_BUSINESS_LABEL
        : sender === 'CUSTOMER'
          ? conversation.customerName
          : 'DVault',
    subject,
    body,
    bodySha256,
    subjectSha256,
    previousHash,
    messageHash: simulatedMessageHash({
      workspaceId: LOCAL_WORKSPACE_ID,
      conversationId: conversation.id,
      messageId,
      channel: conversation.channel,
      direction: sender === 'BUSINESS' ? 'OUTBOUND' : 'INBOUND',
      sender,
      sentAt,
      bodySha256,
      subjectSha256,
      previousHash,
    }),
    sentAt,
    retentionState: 'FULL',
    redactedAt: null,
    purgedAt: null,
    readByBusinessAt: sender === 'BUSINESS' ? sentAt : null,
    readByCustomerAt: sender === 'CUSTOMER' ? sentAt : null,
    tamperState: 'VERIFIED',
  }
  conversation.messages.push(message)
  return message
}

function classify(conversation: Conversation, policy: RetentionPolicy): InteractionLevel {
  const age = Date.now() - new Date(conversation.lastActivityAt).getTime()
  if (age <= policy.activeDays * DAY || conversation.messageCount >= policy.highMinMessages) {
    return 'HIGH'
  }
  if (age <= policy.mediumDays * DAY || conversation.messageCount >= policy.mediumMinMessages) {
    return 'MEDIUM'
  }
  return 'LOW'
}

function refreshMetrics(conversation: Conversation, policy: RetentionPolicy): void {
  conversation.messageCount = conversation.messages.length
  conversation.lastActivityAt =
    conversation.messages[conversation.messages.length - 1]?.sentAt ?? conversation.createdAt
  conversation.interactionLevel = classify(conversation, policy)
  conversation.unreadForBusiness = conversation.messages.filter(
    (message) => message.sender === 'CUSTOMER' && !message.readByBusinessAt,
  ).length
  conversation.unreadForCustomer = conversation.messages.filter(
    (message) => message.sender === 'BUSINESS' && !message.readByCustomerAt,
  ).length
  const states = new Set(conversation.messages.map((message) => message.retentionState))
  conversation.retentionClass =
    states.size === 0
      ? 'FULL'
      : states.size > 1
        ? 'MIXED'
        : (states.values().next().value ?? 'FULL')
  conversation.integrityState = conversation.messages.some(
    (message) => message.tamperState !== 'VERIFIED',
  )
    ? 'FLAGGED'
    : 'VERIFIED'
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export function localMessagingSnapshot(subjectRef?: string): {
  conversations: Conversation[]
  retentionPolicy: RetentionPolicy
  retentionRuns: RetentionRun[]
  withdrawalTiers: WithdrawalTier[]
  messageIntegrity: MessageIntegrity
} {
  const conversations = state.conversations
    .filter((conversation) => !subjectRef || conversation.subjectRef === subjectRef)
    .map((conversation) => clone(conversation))
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
  return {
    conversations,
    retentionPolicy: clone(state.policy),
    retentionRuns: clone(state.runs),
    withdrawalTiers: clone(state.tiers),
    messageIntegrity: integrityFor(conversations),
  }
}

function integrityFor(conversations: Conversation[]): MessageIntegrity {
  const messages = conversations.flatMap((conversation) => conversation.messages)
  const flaggedConversations = conversations.filter(
    (conversation) => conversation.integrityState === 'FLAGGED',
  ).length
  return {
    status: flaggedConversations > 0 ? 'FLAGGED' : 'VERIFIED',
    conversationTotal: conversations.length,
    messageTotal: messages.length,
    verifiedConversations: conversations.length - flaggedConversations,
    flaggedConversations,
    flaggedMessages: messages.filter((message) => message.tamperState !== 'VERIFIED').length,
    headHash: messages[messages.length - 1]?.messageHash ?? GENESIS_HASH,
  }
}

export function applyLocalMessaging(data: DemoData): DemoData {
  return {
    ...data,
    conversations: localMessagingSnapshot().conversations,
    retentionPolicy: clone(state.policy),
    retentionRuns: clone(state.runs),
    withdrawalTiers: clone(state.tiers),
    messageIntegrity: integrityFor(state.conversations),
  }
}

export function localCreateConversation(payload: ConversationDraft): void {
  const channel = payload.channel === 'email' ? 'email' : 'chat'
  const subject = payload.subject?.trim() || (channel === 'chat' ? 'Direct chat' : 'Email thread')
  const conversation: Conversation = {
    id: nextId('conv-live'),
    subjectRef: payload.subjectRef,
    customerName: payload.subjectRef,
    channel,
    subject,
    status: 'OPEN',
    interactionLevel: 'HIGH',
    retentionClass: 'FULL',
    integrityState: 'VERIFIED',
    holdActive: false,
    unreadForBusiness: 0,
    unreadForCustomer: 0,
    messageCount: 0,
    lastActivityAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    messages: [],
  }
  state.conversations.push(conversation)
  appendMessage(conversation, 'BUSINESS', payload.body, 0, subject)
}

export function localSendMessage(
  conversationId: string,
  body: string,
  sender: MessageSender,
): void {
  const conversation = state.conversations.find((entry) => entry.id === conversationId)
  if (!conversation) throw new Error('The conversation could not be found.')
  appendMessage(conversation, sender, body, 0)
  conversation.status = 'OPEN'
  refreshMetrics(conversation, state.policy)

  // Queue a simulated auto-reply from the other side so the demo feels alive.
  const replySender: MessageSender = sender === 'BUSINESS' ? 'CUSTOMER' : 'BUSINESS'
  scheduleAutoReply(conversationId, replySender)
}

// ---------------------------------------------------------------------------
//  Simulated auto-reply (demo only)
// ---------------------------------------------------------------------------
const CUSTOMER_REPLIES = [
  'Thank you, I will review this shortly.',
  'Got it. Let me know if there is anything else I need to do.',
  'Sure, that works for me.',
  'Thanks for the update!',
  'Could you share more details on this?',
  'Perfect, I appreciate the quick response.',
  'Noted, I will get back to you by tomorrow.',
]

const BUSINESS_REPLIES = [
  'Thank you for reaching out. We will look into this right away.',
  'We have noted your message and will follow up shortly.',
  'Sure thing — our team is reviewing your request now.',
  'Thanks for letting us know. We will update you within 24 hours.',
  'Absolutely. I have forwarded this to the relevant team.',
  'Thanks! Your query has been logged and assigned.',
]

let autoReplyTimer: ReturnType<typeof setTimeout> | null = null
let autoReplyListeners: Array<() => void> = []

function pickReply(sender: MessageSender): string {
  const pool = sender === 'CUSTOMER' ? CUSTOMER_REPLIES : BUSINESS_REPLIES
  return pool[Math.floor(Math.random() * pool.length)]!
}

function scheduleAutoReply(conversationId: string, replySender: MessageSender): void {
  // Clear any existing timer so we don't pile up replies.
  if (autoReplyTimer) clearTimeout(autoReplyTimer)

  const delay = 1200 + Math.random() * 1800 // 1.2–3 s
  autoReplyTimer = setTimeout(() => {
    autoReplyTimer = null
    const conversation = state.conversations.find((entry) => entry.id === conversationId)
    if (!conversation || conversation.status === 'ARCHIVED') return

    appendMessage(conversation, replySender, pickReply(replySender), 0)
    refreshMetrics(conversation, state.policy)
    // Bump unread counters so the UI notices.
    if (replySender === 'CUSTOMER') {
      conversation.unreadForBusiness += 1
    } else {
      conversation.unreadForCustomer += 1
    }

    // Notify listeners (DemoProvider / UserProvider) to re-render.
    for (const listener of autoReplyListeners) listener()
  }, delay)
}

/**
 * Register a callback that fires whenever an auto-reply lands.
 * Returns an unsubscribe function.
 */
export function onAutoReply(listener: () => void): () => void {
  autoReplyListeners.push(listener)
  return () => {
    autoReplyListeners = autoReplyListeners.filter((entry) => entry !== listener)
  }
}

export function localMarkRead(conversationId: string, side: 'business' | 'customer'): void {
  const conversation = state.conversations.find((entry) => entry.id === conversationId)
  if (!conversation) throw new Error('The conversation could not be found.')
  const now = new Date().toISOString()
  for (const message of conversation.messages) {
    if (side === 'business' && message.sender === 'CUSTOMER' && !message.readByBusinessAt) {
      message.readByBusinessAt = now
    }
    if (side === 'customer' && message.sender === 'BUSINESS' && !message.readByCustomerAt) {
      message.readByCustomerAt = now
    }
  }
  refreshMetrics(conversation, state.policy)
}

export function localArchiveConversation(conversationId: string): void {
  const conversation = state.conversations.find((entry) => entry.id === conversationId)
  if (!conversation) throw new Error('The conversation could not be found.')
  conversation.status = conversation.status === 'ARCHIVED' ? 'OPEN' : 'ARCHIVED'
}

export function localVerifyConversation(conversationId: string): void {
  const conversation = state.conversations.find((entry) => entry.id === conversationId)
  if (!conversation) throw new Error('The conversation could not be found.')
  let previous: ConversationMessage | undefined
  for (const message of conversation.messages) {
    const expected = simulatedMessageHash({
      workspaceId: LOCAL_WORKSPACE_ID,
      conversationId: conversation.id,
      messageId: message.id,
      channel: conversation.channel,
      direction: message.direction,
      sender: message.sender,
      sentAt: message.sentAt,
      bodySha256: message.bodySha256,
      subjectSha256: message.subjectSha256,
      previousHash: previous?.messageHash ?? GENESIS_HASH,
    })
    message.tamperState = expected === message.messageHash ? 'VERIFIED' : 'TAMPERED'
    previous = message
  }
  refreshMetrics(conversation, state.policy)
}

export function localVerifyAll(): void {
  for (const conversation of state.conversations) localVerifyConversation(conversation.id)
}

export function localUpdatePolicy(payload: RetentionPolicyDraft): void {
  const actions = payload.actions
  if (
    !actions.HIGH ||
    !actions.MEDIUM ||
    !actions.LOW ||
    payload.mediumDays <= payload.activeDays ||
    payload.highMinMessages < 1 ||
    payload.mediumMinMessages < 1 ||
    payload.highMinMessages < payload.mediumMinMessages ||
    actions.HIGH !== 'FULL' ||
    rank(actions.MEDIUM) > rank(actions.HIGH) ||
    rank(actions.LOW) > rank(actions.MEDIUM)
  ) {
    throw new Error('Retention thresholds and actions must be valid and ordered.')
  }
  state.policy = {
    ...state.policy,
    version: state.policy.version + 1,
    activeDays: payload.activeDays,
    mediumDays: payload.mediumDays,
    highMinMessages: payload.highMinMessages,
    mediumMinMessages: payload.mediumMinMessages,
    actions: { ...actions },
    updatedAt: new Date().toISOString(),
  }
}

function rank(action: RetentionAction): number {
  return action === 'FULL' ? 2 : action === 'METADATA' ? 1 : 0
}

export function localRunRetention(
  effect: WithdrawalEffect | null = null,
  subjectRef?: string,
): RetentionRun {
  const now = new Date().toISOString()
  const run: RetentionRun = {
    id: nextId('run'),
    policyVersion: state.policy.version,
    trigger: effect ? 'WITHDRAWAL' : 'MANUAL',
    startedAt: now,
    finishedAt: now,
    scanned: 0,
    retained: 0,
    reduced: 0,
    purged: 0,
    restricted: 0,
    skippedHold: 0,
    details: [],
  }
  for (const conversation of state.conversations) {
    if (subjectRef && conversation.subjectRef !== subjectRef) continue
    refreshMetrics(conversation, state.policy)
    run.scanned += 1
    if (conversation.holdActive) {
      run.skippedHold += 1
      run.restricted += 1
      run.details.push({
        conversation_id: conversation.id,
        interaction_level: conversation.interactionLevel,
        action: 'RESTRICTED',
        reason: 'ACTIVE_RETENTION_HOLD',
      })
      continue
    }
    let action = state.policy.actions[conversation.interactionLevel] ?? 'FULL'
    if (effect === 'REDUCE_LOW' && conversation.interactionLevel === 'LOW') action = 'METADATA'
    if (
      effect === 'PURGE_LOW_MEDIUM' &&
      (conversation.interactionLevel === 'LOW' || conversation.interactionLevel === 'MEDIUM')
    ) {
      action = 'PURGED'
    }
    if (action === 'FULL') {
      run.retained += 1
      continue
    }
    let reduced = 0
    let purged = 0
    for (const message of conversation.messages) {
      if (action === 'METADATA' && message.retentionState === 'FULL') {
        message.body = null
        message.retentionState = 'METADATA'
        message.redactedAt = now
        reduced += 1
      }
      if (action === 'PURGED' && message.retentionState !== 'PURGED') {
        message.body = null
        message.retentionState = 'PURGED'
        message.purgedAt = now
        message.redactedAt = message.redactedAt ?? now
        purged += 1
      }
    }
    if (reduced) run.reduced += 1
    if (purged) run.purged += 1
    run.details.push({
      conversation_id: conversation.id,
      interaction_level: conversation.interactionLevel,
      action,
      reduced,
      purged,
    })
    refreshMetrics(conversation, state.policy)
  }
  state.runs.unshift(run)
  state.runs = state.runs.slice(0, 12)
  return clone(run)
}

export function localUpdateTier(
  key: WithdrawalTierKey,
  payload: {
    label?: string
    description?: string
    effect?: string
    active?: boolean
    displayOrder?: number
    purposes?: string[]
  },
): void {
  const tier = state.tiers.find((entry) => entry.key === key)
  if (!tier) throw new Error('The withdrawal tier was not found.')
  if (payload.label !== undefined) tier.label = payload.label
  if (payload.description !== undefined) tier.description = payload.description
  if (payload.effect !== undefined) {
    if (!['KEEP_ALL', 'REDUCE_LOW', 'PURGE_LOW_MEDIUM'].includes(payload.effect)) {
      throw new Error('The tier effect is not recognised.')
    }
    tier.effect = payload.effect as WithdrawalEffect
  }
  if (payload.active !== undefined) tier.active = payload.active
  if (payload.displayOrder !== undefined) tier.displayOrder = payload.displayOrder
  if (payload.purposes !== undefined) {
    if (!payload.purposes.length || payload.purposes.includes('service')) {
      throw new Error('Optional purposes are required and service cannot be withdrawn.')
    }
    tier.purposes = [...new Set(payload.purposes)]
  }
  tier.version += 1
  tier.updatedAt = new Date().toISOString()
}

export function localWithdraw(
  key: WithdrawalTierKey,
  subjectRef: string = LOCAL_DEMO_SUBJECT,
): WithdrawalTier {
  const tier = state.tiers.find((entry) => entry.key === key)
  if (!tier) throw new Error('The withdrawal tier was not found.')
  if (!tier.active) throw new Error('The selected withdrawal tier is not active.')
  if (tier.effect !== 'KEEP_ALL') localRunRetention(tier.effect, subjectRef)
  return clone(tier)
}
