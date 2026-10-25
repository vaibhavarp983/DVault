export type MessageChannel = 'email' | 'chat'
export type MessageSender = 'CUSTOMER' | 'BUSINESS' | 'SYSTEM'
export type MessageDirection = 'INBOUND' | 'OUTBOUND'
export type RetentionState = 'FULL' | 'METADATA' | 'PURGED' | 'MIXED'
export type InteractionLevel = 'HIGH' | 'MEDIUM' | 'LOW'
export type RetentionAction = 'FULL' | 'METADATA' | 'PURGED'
export type WithdrawalEffect = 'KEEP_ALL' | 'REDUCE_LOW' | 'PURGE_LOW_MEDIUM'
export type WithdrawalTierKey = 'marketing-only' | 'all-optional' | 'full-withdrawal' | string

export interface ConversationMessage {
  id: string
  conversationId: string
  sequence: number
  direction: MessageDirection
  sender: MessageSender
  authorLabel: string
  subject: string
  body: string | null
  bodySha256: string
  subjectSha256: string
  previousHash: string
  messageHash: string
  sentAt: string
  retentionState: RetentionState
  redactedAt: string | null
  purgedAt: string | null
  readByBusinessAt: string | null
  readByCustomerAt: string | null
  tamperState: string
}

export interface Conversation {
  id: string
  subjectRef: string
  customerName: string
  channel: MessageChannel
  subject: string
  status: string
  interactionLevel: InteractionLevel
  retentionClass: string
  integrityState: string
  holdActive: boolean
  unreadForBusiness: number
  unreadForCustomer: number
  messageCount: number
  lastActivityAt: string
  createdAt: string
  messages: ConversationMessage[]
}

export interface RetentionPolicy {
  id: string
  version: number
  active: boolean
  activeDays: number
  mediumDays: number
  highMinMessages: number
  mediumMinMessages: number
  actions: Record<string, RetentionAction>
  updatedAt: string | null
}

export interface RetentionRun {
  id: string
  policyVersion: number
  trigger: string
  startedAt: string
  finishedAt: string | null
  scanned: number
  retained: number
  reduced: number
  purged: number
  restricted: number
  skippedHold: number
  details: Array<Record<string, unknown>>
}

export interface WithdrawalTier {
  id: string
  key: WithdrawalTierKey
  label: string
  description: string
  purposes: string[]
  effect: WithdrawalEffect
  displayOrder: number
  active: boolean
  version: number
  updatedAt: string | null
}

export interface MessageIntegrity {
  status: string
  conversationTotal: number
  messageTotal: number
  verifiedConversations: number
  flaggedConversations: number
  flaggedMessages: number
  headHash: string
}

export interface ConversationDraft {
  subjectRef: string
  channel: MessageChannel
  subject?: string
  body: string
}

export interface RetentionPolicyDraft {
  activeDays: number
  mediumDays: number
  highMinMessages: number
  mediumMinMessages: number
  actions: Record<string, RetentionAction>
}
