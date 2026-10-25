import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  localBizOverlaySnapshot,
  localMessagingSnapshot,
  resetLocalMessagingStore,
} from '@/data/local-messaging-store'
import { UserProvider, useUser } from './user-provider'

const { repository } = vi.hoisted(() => {
  const apiConversation = {
    id: 'conv-api-aranya-email',
    subjectRef: 'usr-rowan',
    customerName: 'Rowan Ellis',
    channel: 'email' as const,
    subject: 'API-backed thread',
    status: 'OPEN',
    interactionLevel: 'HIGH' as const,
    retentionClass: 'FULL',
    integrityState: 'VERIFIED',
    holdActive: false,
    unreadForBusiness: 0,
    unreadForCustomer: 0,
    messageCount: 0,
    lastActivityAt: '2026-10-25T12:00:00.000Z',
    createdAt: '2026-10-25T12:00:00.000Z',
    businessCode: 'BIZ-ARANYA',
    businessName: 'Aranya Coaching Centre',
    messageType: 'GENERAL_ENQUIRY' as const,
    messages: [],
  }
  const workspace = {
    generatedAt: '2026-10-25T12:00:00.000Z',
    notice: 'Synthetic demo',
    profile: {
      id: 'usr-rowan',
      name: 'Rowan Ellis',
      email: 'rowan@example.test',
      phone: '+91 90000 00000',
      location: 'Bengaluru',
      memberSince: '2024-01-01',
      synthetic: true as const,
    },
    sources: [],
    consents: [],
    documents: [],
    requests: [],
    activity: [],
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
  }
  const repository = {
    load: vi.fn(async () => structuredClone(workspace)),
    refresh: vi.fn(async () => structuredClone(workspace)),
    setConsent: vi.fn(async () => structuredClone(workspace)),
    createRequest: vi.fn(async () => structuredClone(workspace)),
    retryRequest: vi.fn(async () => structuredClone(workspace)),
    createBizConversation: vi.fn(async () => structuredClone(workspace)),
    sendMessage: vi.fn(async () => structuredClone(workspace)),
    markConversationRead: vi.fn(async () => structuredClone(workspace)),
    verifyConversation: vi.fn(async () => structuredClone(workspace)),
    withdraw: vi.fn(async () => structuredClone(workspace)),
    reset: vi.fn(async () => structuredClone(workspace)),
  }
  return { repository, workspace }
})

vi.mock('@/data/config', () => ({
  apiBaseUrl: 'http://127.0.0.1:8000',
  dataMode: 'api',
}))

vi.mock('@/data/user-service', () => ({ userRepository: repository }))

function Harness() {
  const { status, data, addBizConversation, sendMessage } = useUser()
  const [createdId, setCreatedId] = useState<string | null>(null)
  const overlay = data?.conversations?.find((entry) =>
    entry.id.startsWith('conv-biz-'),
  )
  const apiConversation = data?.conversations?.find(
    (entry) => entry.id === 'conv-api-aranya-email',
  )
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="count">{data?.conversations?.length ?? 0}</span>
      <span data-testid="overlay-name">{overlay?.businessName ?? 'none'}</span>
      <span data-testid="api-name">{apiConversation?.businessName ?? 'none'}</span>
      <button
        type="button"
        onClick={() => {
          void addBizConversation({
            bizCode: 'BIZ-LOT002',
            channel: 'chat',
            messageType: 'GENERAL_ENQUIRY',
            subject: 'General enquiry',
            body: 'Hello Lotus Bloom Clinic, I have a general enquiry.',
          }).then((id) => setCreatedId(id))
        }}
      >
        Add business
      </button>
      <button
        type="button"
        onClick={() => {
          if (createdId) void sendMessage(createdId, 'Following up.')
        }}
      >
        Send overlay
      </button>
      <button
        type="button"
        onClick={() => {
          if (apiConversation) void sendMessage(apiConversation.id, 'API reply.')
        }}
      >
        Send API
      </button>
    </div>
  )
}

beforeEach(() => {
  resetLocalMessagingStore()
  vi.clearAllMocks()
})

describe('UserProvider API business overlay', () => {
  it('merges a locally created business thread with API conversations', async () => {
    render(
      <UserProvider>
        <Harness />
      </UserProvider>,
    )
    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('count')).toHaveTextContent('1')
    expect(screen.getByTestId('api-name')).toHaveTextContent('Aranya Coaching Centre')

    fireEvent.click(screen.getByRole('button', { name: 'Add business' }))

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
    expect(screen.getByTestId('overlay-name')).toHaveTextContent('Lotus Bloom Clinic')
    expect(screen.getByTestId('api-name')).toHaveTextContent('Aranya Coaching Centre')
    expect(repository.createBizConversation).not.toHaveBeenCalled()
    expect(localBizOverlaySnapshot().conversations).toHaveLength(1)
  })

  it('routes overlay messages locally and API messages through the repository', async () => {
    render(
      <UserProvider>
        <Harness />
      </UserProvider>,
    )
    await screen.findByText('ready')
    fireEvent.click(screen.getByRole('button', { name: 'Add business' }))
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))

    fireEvent.click(screen.getByRole('button', { name: 'Send overlay' }))
    await waitFor(() => {
      const conversation = localBizOverlaySnapshot().conversations[0]
      expect(conversation?.messages).toHaveLength(2)
      expect(conversation?.messages.at(-1)?.body).toBe('Following up.')
    })
    expect(repository.sendMessage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Send API' }))
    await waitFor(() =>
      expect(repository.sendMessage).toHaveBeenCalledWith(
        'conv-api-aranya-email',
        'API reply.',
      ),
    )
    expect(
      localMessagingSnapshot('usr-rowan').conversations.find(
        (entry) => entry.id === 'conv-api-aranya-email',
      ),
    ).toBeUndefined()
  })
})
