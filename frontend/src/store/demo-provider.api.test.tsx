import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  localBizOverlaySnapshot,
  localCreateBizConversation,
  resetLocalMessagingStore,
} from '@/data/local-messaging-store'
import { DemoProvider, useDemo } from './demo-provider'

const { repository } = vi.hoisted(() => {
  const apiConversation = {
    id: 'conv-api-aranya-chat',
    subjectRef: 'usr-rowan',
    customerName: 'Rowan Ellis',
    channel: 'chat' as const,
    subject: 'API-backed chat',
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
    setContactMode: vi.fn(),
    load: vi.fn(async () => structuredClone(workspace)),
    refresh: vi.fn(async () => structuredClone(workspace)),
    sendMessage: vi.fn(async () => structuredClone(workspace)),
    markConversationRead: vi.fn(async () => structuredClone(workspace)),
    archiveConversation: vi.fn(async () => structuredClone(workspace)),
    verifyConversation: vi.fn(async () => structuredClone(workspace)),
  }
  return { repository }
})

vi.mock('@/data/config', () => ({
  apiBaseUrl: 'http://127.0.0.1:8000',
  dataMode: 'api',
  defaultContactMode: 'masked',
  demoControlsEnabled: true,
}))

vi.mock('@/data/service', () => ({ demoRepository: repository }))

function Harness() {
  const { status, data, sendMessage } = useDemo()
  const overlay = data?.conversations?.find((entry) => entry.id.startsWith('conv-biz-'))
  const apiConversation = data?.conversations?.find(
    (entry) => entry.id === 'conv-api-aranya-chat',
  )
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="count">{data?.conversations?.length ?? 0}</span>
      <span data-testid="overlay-name">{overlay?.businessName ?? 'none'}</span>
      <button
        type="button"
        onClick={() => {
          if (overlay) void sendMessage(overlay.id, 'Business reply.')
        }}
      >
        Reply overlay
      </button>
      <button
        type="button"
        onClick={() => {
          if (apiConversation) void sendMessage(apiConversation.id, 'API reply.')
        }}
      >
        Reply API
      </button>
    </div>
  )
}

beforeEach(() => {
  resetLocalMessagingStore()
  vi.clearAllMocks()
})

describe('DemoProvider API business overlay', () => {
  it('merges session-only threads into the API workspace', async () => {
    const overlay = localCreateBizConversation({
      bizCode: 'BIZ-LOT002',
      channel: 'chat',
      messageType: 'GENERAL_ENQUIRY',
      body: 'Hello Lotus Bloom Clinic.',
    })
    render(
      <DemoProvider>
        <Harness />
      </DemoProvider>,
    )
    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('count')).toHaveTextContent('2')
    expect(screen.getByTestId('overlay-name')).toHaveTextContent('Lotus Bloom Clinic')
    expect(localBizOverlaySnapshot().conversations[0]?.id).toBe(overlay.id)
  })

  it('routes overlay replies locally and API replies through the repository', async () => {
    localCreateBizConversation({
      bizCode: 'BIZ-LOT002',
      channel: 'chat',
      messageType: 'GENERAL_ENQUIRY',
      body: 'Hello Lotus Bloom Clinic.',
    })
    render(
      <DemoProvider>
        <Harness />
      </DemoProvider>,
    )
    await screen.findByText('ready')

    fireEvent.click(screen.getByRole('button', { name: 'Reply overlay' }))
    await waitFor(() => {
      const conversation = localBizOverlaySnapshot().conversations[0]
      expect(conversation?.messages).toHaveLength(2)
      expect(conversation?.messages.at(-1)?.sender).toBe('BUSINESS')
    })
    expect(repository.sendMessage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Reply API' }))
    await waitFor(() =>
      expect(repository.sendMessage).toHaveBeenCalledWith(
        'conv-api-aranya-chat',
        'API reply.',
      ),
    )
  })
})
