import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { apiBaseUrl, dataMode } from '@/data/config'
import { resolveBizCode } from '@/data/business-directory'
import {
  LOCAL_DEMO_SUBJECT,
  isOverlayConversationId,
  localBizOverlaySnapshot,
  localCreateBizConversation,
  localMarkRead,
  localMessagingSnapshot,
  localSendMessage,
  localVerifyConversation,
  mergeLocalBizOverlay,
  subscribeMessaging,
  type LocalMessagingSnapshot,
} from '@/data/local-messaging-store'
import type { CorrectionPayload, DataMode } from '@/data/repository'
import { userRepository } from '@/data/user-service'
import type { BizConversationDraft } from '@/domain/messaging'
import type { AppNotification, NotificationTone, RightsRequestType } from '@/domain/types'
import type { UserWorkspace } from '@/domain/user'

type LoadStatus = 'loading' | 'ready' | 'error'

interface UserContextValue {
  status: LoadStatus
  data: UserWorkspace | null
  error: string | null
  refreshing: boolean
  mode: DataMode
  apiBaseUrl: string | null
  notifications: AppNotification[]
  refresh: () => Promise<void>
  setConsent: (consentId: string, granted: boolean) => Promise<boolean>
  createRequest: (type: RightsRequestType, correction?: CorrectionPayload) => Promise<boolean>
  retryRequest: (requestId: string) => Promise<boolean>
  addBizConversation: (draft: BizConversationDraft) => Promise<string | null>
  sendMessage: (conversationId: string, body: string) => Promise<boolean>
  markConversationRead: (conversationId: string) => Promise<void>
  verifyConversation: (conversationId: string) => Promise<void>
  withdraw: (tier: string) => Promise<boolean>
  reset: () => Promise<void>
  dismissNotification: (id: string) => void
  clearNotifications: () => void
}

const UserContext = createContext<UserContextValue | null>(null)

function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong while loading your personal data.'
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [data, setData] = useState<UserWorkspace | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const counter = useRef(0)

  const notify = useCallback(
    (title: string, body: string, tone: NotificationTone = 'info') => {
      counter.current += 1
      setNotifications((current) =>
        [
          {
            id: `utoast-${Date.now()}-${counter.current}`,
            title,
            body,
            tone,
            at: new Date().toISOString(),
            read: false,
          },
          ...current,
        ].slice(0, 4),
      )
    },
    [],
  )

  const handleError = useCallback(
    (caught: unknown) => {
      const message = describeError(caught)
      if (data) {
        notify('Request failed', message, 'danger')
        setRefreshing(false)
      } else {
        setError(message)
        setStatus('error')
      }
    },
    [data, notify],
  )

  const acceptWorkspace = useCallback((workspace: UserWorkspace) => {
    setData(dataMode === 'api' ? mergeLocalBizOverlay(workspace) : workspace)
  }, [])

  const acceptOverlaySnapshot = useCallback(
    (snapshot: LocalMessagingSnapshot = localBizOverlaySnapshot()) => {
      setData((current) => (current ? mergeLocalBizOverlay(current, snapshot) : current))
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    userRepository
      .load()
      .then((workspace) => {
        if (cancelled) return
        acceptWorkspace(workspace)
        setStatus('ready')
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(describeError(caught))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [acceptWorkspace])

  useEffect(() => {
    return subscribeMessaging(() => {
      if (dataMode === 'local') {
        const snapshot = localMessagingSnapshot(LOCAL_DEMO_SUBJECT)
        setData((current) =>
          current
            ? {
                ...current,
                conversations: snapshot.conversations,
                retentionPolicy: snapshot.retentionPolicy,
                withdrawalTiers: snapshot.withdrawalTiers,
                messageIntegrity: snapshot.messageIntegrity,
              }
            : current,
        )
        return
      }
      setData((current) =>
        current ? mergeLocalBizOverlay(current, localBizOverlaySnapshot()) : current,
      )
    })
  }, [])

  const refresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const workspace = await userRepository.refresh()
      acceptWorkspace(workspace)
      setStatus('ready')
      setError(null)
    } catch (caught) {
      handleError(caught)
    } finally {
      setRefreshing(false)
    }
  }, [acceptWorkspace, handleError, refreshing])

  const setConsent = useCallback(
    async (consentId: string, granted: boolean): Promise<boolean> => {
      try {
        const workspace = await userRepository.setConsent(consentId, granted)
        acceptWorkspace(workspace)
        setStatus('ready')
        const consent = workspace.consents.find((entry) => entry.id === consentId)
        if (consent) {
          notify(
            'Consent updated',
            `${consent.purpose} is now ${granted ? 'granted' : 'withdrawn'}.`,
            granted ? 'success' : 'info',
          )
        }
        return true
      } catch (caught) {
        handleError(caught)
        return false
      }
    },
    [acceptWorkspace, handleError, notify],
  )

  const createRequest = useCallback(
    async (type: RightsRequestType, correction?: CorrectionPayload): Promise<boolean> => {
      try {
        const workspace = await userRepository.createRequest(type, correction)
        acceptWorkspace(workspace)
        setStatus('ready')
        const latest = workspace.requests[0]
        notify(
          'Request submitted',
          latest
            ? `${latest.reference} is now with the rights team.`
            : 'Your request has been submitted.',
          'success',
        )
        return true
      } catch (caught) {
        handleError(caught)
        return false
      }
    },
    [acceptWorkspace, handleError, notify],
  )

  const retryRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      try {
        const workspace = await userRepository.retryRequest(requestId)
        acceptWorkspace(workspace)
        setStatus('ready')
        const request = workspace.requests.find((entry) => entry.id === requestId)
        notify(
          'Retry queued',
          request
            ? `${request.reference} will retry the failed step.`
            : 'The failed step has been reopened.',
          'info',
        )
        return true
      } catch (caught) {
        handleError(caught)
        return false
      }
    },
    [acceptWorkspace, handleError, notify],
  )

  const addBizConversation = useCallback(
    async (draft: BizConversationDraft): Promise<string | null> => {
      const business = resolveBizCode(draft.bizCode)
      if (!business) {
        handleError(new Error('That business code was not found.'))
        return null
      }
      if (dataMode === 'api') {
        const existing = data?.conversations?.find(
          (entry) =>
            entry.businessCode === business.code &&
            entry.channel === draft.channel &&
            !isOverlayConversationId(entry.id),
        )
        try {
          if (existing) {
            const workspace = await userRepository.sendMessage(existing.id, draft.body)
            acceptWorkspace(workspace)
            notify(
              draft.channel === 'email' ? 'Mail sent' : 'Chat started',
              `${business.name} will see your message in the business portal.`,
              'success',
            )
            return existing.id
          }
          const conversation = localCreateBizConversation(
            { ...draft, bizCode: business.code },
            { overlayOnly: true },
          )
          acceptOverlaySnapshot()
          notify(
            draft.channel === 'email' ? 'Mail sent' : 'Chat started',
            `${business.name} will see your message in the business portal for this session.`,
            'success',
          )
          return conversation.id
        } catch (caught) {
          handleError(caught)
          return null
        }
      }
      try {
        const workspace = await userRepository.createBizConversation({
          ...draft,
          bizCode: business.code,
        })
        acceptWorkspace(workspace)
        setStatus('ready')
        const conversation = workspace.conversations?.find(
          (entry) => entry.businessCode === business.code && entry.channel === draft.channel,
        )
        notify(
          draft.channel === 'email' ? 'Mail sent' : 'Chat started',
          `${business.name} will see your message in the business portal.`,
          'success',
        )
        return conversation?.id ?? null
      } catch (caught) {
        handleError(caught)
        return null
      }
    },
    [acceptOverlaySnapshot, acceptWorkspace, data, handleError, notify],
  )

  const sendMessage = useCallback(
    async (conversationId: string, body: string): Promise<boolean> => {
      if (dataMode === 'api' && isOverlayConversationId(conversationId)) {
        try {
          localSendMessage(conversationId, body, 'CUSTOMER')
          acceptOverlaySnapshot()
          notify('Message sent', 'The business will see it in their Mail or Messages app.', 'success')
          return true
        } catch (caught) {
          handleError(caught)
          return false
        }
      }
      try {
        const workspace = await userRepository.sendMessage(conversationId, body)
        acceptWorkspace(workspace)
        notify('Message sent', 'The business will see it in their Mail or Messages app.', 'success')
        return true
      } catch (caught) {
        handleError(caught)
        return false
      }
    },
    [acceptOverlaySnapshot, acceptWorkspace, handleError, notify],
  )

  const markConversationRead = useCallback(
    async (conversationId: string) => {
      if (dataMode === 'api' && isOverlayConversationId(conversationId)) {
        try {
          localMarkRead(conversationId, 'customer')
          acceptOverlaySnapshot()
        } catch (caught) {
          handleError(caught)
        }
        return
      }
      try {
        const workspace = await userRepository.markConversationRead(conversationId)
        acceptWorkspace(workspace)
      } catch (caught) {
        handleError(caught)
      }
    },
    [acceptOverlaySnapshot, acceptWorkspace, handleError],
  )

  const verifyConversation = useCallback(
    async (conversationId: string) => {
      if (dataMode === 'api' && isOverlayConversationId(conversationId)) {
        try {
          localVerifyConversation(conversationId)
          acceptOverlaySnapshot()
          notify('Conversation verified', 'Message hashes match the local simulated chain.', 'info')
        } catch (caught) {
          handleError(caught)
        }
        return
      }
      try {
        const workspace = await userRepository.verifyConversation(conversationId)
        acceptWorkspace(workspace)
        notify('Conversation verified', 'Message hashes match the local simulated chain.', 'info')
      } catch (caught) {
        handleError(caught)
      }
    },
    [acceptOverlaySnapshot, acceptWorkspace, handleError, notify],
  )

  const withdraw = useCallback(
    async (tier: string): Promise<boolean> => {
      try {
        const workspace = await userRepository.withdraw(tier)
        acceptWorkspace(workspace)
        notify(
          'Withdrawal applied',
          'Optional purposes were withdrawn and the matching retention effect ran.',
          'success',
        )
        return true
      } catch (caught) {
        handleError(caught)
        return false
      }
    },
    [acceptWorkspace, handleError, notify],
  )

  const reset = useCallback(async () => {
    try {
      const workspace = await userRepository.reset()
      acceptWorkspace(workspace)
      setStatus('ready')
      setNotifications([])
      notify('Personal demo reset', 'Your synthetic data has been restored.', 'success')
    } catch (caught) {
      handleError(caught)
    }
  }, [acceptWorkspace, handleError, notify])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id))
  }, [])

  const clearNotifications = useCallback(() => setNotifications([]), [])

  const value = useMemo<UserContextValue>(
    () => ({
      status,
      data,
      error,
      refreshing,
      mode: dataMode,
      apiBaseUrl: dataMode === 'api' ? apiBaseUrl : null,
      notifications,
      refresh,
      setConsent,
      createRequest,
      retryRequest,
      addBizConversation,
      sendMessage,
      markConversationRead,
      verifyConversation,
      withdraw,
      reset,
      dismissNotification,
      clearNotifications,
    }),
    [
      status,
      data,
      error,
      refreshing,
      notifications,
      refresh,
      setConsent,
      createRequest,
      retryRequest,
      addBizConversation,
      sendMessage,
      markConversationRead,
      verifyConversation,
      withdraw,
      reset,
      dismissNotification,
      clearNotifications,
    ],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext)
  if (!context) throw new Error('useUser must be used inside UserProvider')
  return context
}
