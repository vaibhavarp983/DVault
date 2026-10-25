import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aliasForConversation, setNameSafeEnabled } from '@/data/name-safe'
import type { Conversation } from '@/domain/messaging'
import { MessagingApp } from './MessagingApp'

const useDemoMock = vi.hoisted(() => vi.fn())

vi.mock('@/store/demo-provider', () => ({
  useDemo: useDemoMock,
}))

const conversation: Conversation = {
  id: 'conv-name-safe',
  subjectRef: 'usr-rowan',
  customerName: 'Rowan Ellis',
  channel: 'chat',
  subject: 'Name safe chat',
  status: 'OPEN',
  interactionLevel: 'HIGH',
  retentionClass: 'FULL',
  integrityState: 'VERIFIED',
  holdActive: false,
  unreadForBusiness: 0,
  unreadForCustomer: 0,
  messageCount: 1,
  lastActivityAt: '2026-10-25T12:00:00.000Z',
  createdAt: '2026-10-25T12:00:00.000Z',
  businessCode: 'BIZ-ARANYA',
  businessName: 'Aranya Coaching Centre',
  messageType: 'GENERAL_ENQUIRY',
  messages: [
    {
      id: 'msg-name-safe',
      conversationId: 'conv-name-safe',
      sequence: 1,
      direction: 'INBOUND',
      sender: 'CUSTOMER',
      authorLabel: 'Rowan Ellis',
      subject: 'Name safe chat',
      body: 'Hello from the customer.',
      bodySha256: 'body-hash',
      subjectSha256: 'subject-hash',
      previousHash: '0'.repeat(64),
      messageHash: 'message-hash',
      sentAt: '2026-10-25T12:00:00.000Z',
      retentionState: 'FULL',
      redactedAt: null,
      purgedAt: null,
      readByBusinessAt: null,
      readByCustomerAt: null,
      tamperState: 'VERIFIED',
    },
  ],
}

const noop = vi.fn(async () => undefined)

beforeEach(() => {
  setNameSafeEnabled(false)
  useDemoMock.mockReturnValue({
    data: {
      conversations: [conversation],
      messageIntegrity: {
        status: 'VERIFIED',
        conversationTotal: 1,
        messageTotal: 1,
        verifiedConversations: 1,
        flaggedConversations: 0,
        flaggedMessages: 0,
        headHash: 'head',
      },
    },
    status: 'ready',
    refreshing: false,
    mode: 'local',
    createConversation: noop,
    sendMessage: noop,
    markConversationRead: noop,
    archiveConversation: noop,
    verifyConversation: noop,
    verifyMessages: noop,
    runRetention: noop,
    updateRetentionPolicy: noop,
    updateWithdrawalTier: noop,
  })
})

describe('business messaging name safe', () => {
  it('shows the customer name when protection is disabled', () => {
    render(<MessagingApp channel="chat" />)

    expect(screen.getAllByText('Rowan Ellis').length).toBeGreaterThan(0)
    expect(screen.queryByText(/^CST-[A-Z0-9]{4}$/)).not.toBeInTheDocument()
  })

  it('replaces the customer name and author label with the protected code', () => {
    setNameSafeEnabled(true, 'usr-rowan')
    const alias = aliasForConversation(conversation)
    expect(alias).toMatch(/^CST-[A-Z0-9]{4}$/)

    render(<MessagingApp channel="chat" />)

    expect(screen.getAllByText(alias!).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Name Safe')).toBeInTheDocument()
    expect(screen.queryByText('Rowan Ellis')).not.toBeInTheDocument()
  })
})
