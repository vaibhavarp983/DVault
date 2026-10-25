import { beforeEach, describe, expect, it } from 'vitest'
import {
  LOCAL_DEMO_SUBJECT,
  isOverlayConversationId,
  localBizOverlaySnapshot,
  localCreateBizConversation,
  localMarkRead,
  localMessagingSnapshot,
  localSendMessage,
  mergeLocalBizOverlay,
  resetLocalMessagingStore,
  subscribeMessaging,
} from './local-messaging-store'

const createBizChat = (body = 'Do you have an appointment tomorrow?') =>
  localCreateBizConversation({
    bizCode: 'BIZ-GLO005',
    channel: 'chat',
    messageType: 'GENERAL_ENQUIRY',
    body,
  })

beforeEach(() => {
  resetLocalMessagingStore()
})

describe('local business messaging', () => {
  it('creates a customer thread for a business and reuses it', () => {
    const first = createBizChat()
    expect(first.businessCode).toBe('BIZ-GLO005')
    expect(first.businessName).toBe('Glow Point Salon')
    expect(first.customerName).toBe('Rowan Ellis')
    expect(first.messages).toHaveLength(1)
    expect(first.messages[0]?.sender).toBe('CUSTOMER')
    expect(first.unreadForBusiness).toBe(1)

    const second = localCreateBizConversation({
      bizCode: 'BIZ-GLO005',
      channel: 'chat',
      messageType: 'SUPPORT',
      body: 'Following up on my appointment.',
    })
    expect(second.id).toBe(first.id)
    expect(second.messages).toHaveLength(2)
    expect(second.messageType).toBe('SUPPORT')
    expect(second.unreadForBusiness).toBe(2)
  })

  it('keeps mail and chat threads separate for the same business', () => {
    const chat = createBizChat()
    const mail = localCreateBizConversation({
      bizCode: 'BIZ-GLO005',
      channel: 'email',
      messageType: 'INVOICE',
      body: 'Please share the invoice.',
    })
    expect(mail.id).not.toBe(chat.id)
    expect(mail.channel).toBe('email')
    const snapshot = localMessagingSnapshot(LOCAL_DEMO_SUBJECT)
    expect(snapshot.conversations.filter((entry) => entry.businessCode === 'BIZ-GLO005')).toHaveLength(2)
  })

  it('labels business replies and clears customer unread when read', () => {
    const conversation = createBizChat()
    localSendMessage(conversation.id, 'Yes, we have an opening at 4pm.', 'BUSINESS')
    const withReply = localMessagingSnapshot(LOCAL_DEMO_SUBJECT).conversations.find(
      (entry) => entry.id === conversation.id,
    )!
    expect(withReply.messages.at(-1)?.authorLabel).toBe('Glow Point Salon')
    expect(withReply.unreadForCustomer).toBe(1)
    expect(withReply.unreadForBusiness).toBe(1)

    localMarkRead(conversation.id, 'business')
    const read = localMessagingSnapshot(LOCAL_DEMO_SUBJECT).conversations.find(
      (entry) => entry.id === conversation.id,
    )!
    expect(read.unreadForBusiness).toBe(0)
  })

  it('notifies subscribers once per mutation and stops after unsubscribe', () => {
    const calls: number[] = []
    const unsubscribe = subscribeMessaging(() => calls.push(1))
    const conversation = createBizChat()
    expect(calls).toHaveLength(1)
    localSendMessage(conversation.id, 'Thanks!', 'BUSINESS')
    expect(calls).toHaveLength(2)
    unsubscribe()
    localSendMessage(conversation.id, 'See you tomorrow.', 'BUSINESS')
    expect(calls).toHaveLength(2)
  })

  it('exposes only newly created business threads in the API overlay', () => {
    const seeded = localMessagingSnapshot(LOCAL_DEMO_SUBJECT).conversations
    expect(seeded.length).toBeGreaterThan(0)
    expect(localBizOverlaySnapshot().conversations).toHaveLength(0)

    const conversation = createBizChat()
    const overlay = localBizOverlaySnapshot()
    expect(overlay.conversations.map((entry) => entry.id)).toEqual([conversation.id])
    expect(isOverlayConversationId(conversation.id)).toBe(true)
    expect(isOverlayConversationId(seeded[0]!.id)).toBe(false)
  })

  it('does not reuse the seeded Aranya thread when creating an overlay thread', () => {
    const seeded = localMessagingSnapshot(LOCAL_DEMO_SUBJECT).conversations.find(
      (entry) => entry.businessCode === 'BIZ-ARANYA' && entry.channel === 'email',
    )!
    const overlay = localCreateBizConversation(
      {
        bizCode: 'BIZ-ARANYA',
        channel: 'email',
        messageType: 'GENERAL_ENQUIRY',
        body: 'Starting a separate session-only thread.',
      },
      { overlayOnly: true },
    )
    expect(overlay.id).not.toBe(seeded.id)
    expect(isOverlayConversationId(overlay.id)).toBe(true)
  })

  it('merges overlay threads into API conversations without dropping either side', () => {
    const overlay = createBizChat()
    const apiConversation = {
      ...overlay,
      id: 'conv-api-thread',
      subjectRef: 'api-subject',
      customerName: 'API customer',
    }
    const merged = mergeLocalBizOverlay({
      conversations: [apiConversation],
      messageIntegrity: {
        status: 'VERIFIED',
        conversationTotal: 1,
        messageTotal: 0,
        verifiedConversations: 1,
        flaggedConversations: 0,
        flaggedMessages: 0,
        headHash: 'genesis',
      },
    })
    expect(merged.conversations?.map((entry) => entry.id)).toEqual([
      overlay.id,
      apiConversation.id,
    ])
    expect(merged.messageIntegrity?.conversationTotal).toBe(2)
    expect(merged.messageIntegrity?.flaggedConversations).toBe(0)
  })
})
