import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { apiBaseUrl, dataMode } from '@/data/config'
import type { DataMode } from '@/data/repository'
import { demoRepository } from '@/data/service'
import type { AppNotification, DemoData } from '@/domain/types'

type LoadStatus = 'loading' | 'ready' | 'error'

interface DemoState {
  status: LoadStatus
  data: DemoData | null
  error: string | null
  refreshing: boolean
}

type DemoAction =
  | { type: 'loading' }
  | { type: 'ready'; data: DemoData }
  | { type: 'error'; error: string }
  | { type: 'refreshing'; refreshing: boolean }

function reducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'loading':
      return { ...state, status: 'loading', error: null }
    case 'ready':
      return { status: 'ready', data: action.data, error: null, refreshing: false }
    case 'error':
      return { ...state, status: 'error', error: action.error, refreshing: false }
    case 'refreshing':
      return { ...state, refreshing: action.refreshing }
  }
}

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'ntf-welcome',
    title: 'Demo workspace ready',
    body: 'Every customer, document and event is synthetic and safe to explore.',
    at: '2026-10-24T17:09:00Z',
    tone: 'info',
    read: false,
    appId: 'vault',
  },
  {
    id: 'ntf-whatsapp',
    title: 'WhatsApp sync needs attention',
    body: 'History import paused after a rate limit. 2 records are incomplete.',
    at: '2026-10-24T13:12:00Z',
    tone: 'warning',
    read: false,
    appId: 'vault',
  },
  {
    id: 'ntf-rights',
    title: 'Rights request due this week',
    body: 'R-2081 (Marsh Legal) is due on 30 October and still has an unresolved source.',
    at: '2026-10-24T14:40:00Z',
    tone: 'warning',
    read: false,
    appId: 'vault',
  },
]

interface DemoContextValue {
  status: LoadStatus
  data: DemoData | null
  error: string | null
  refreshing: boolean
  mode: DataMode
  apiBaseUrl: string | null
  notifications: AppNotification[]
  unreadCount: number
  refresh: () => Promise<void>
  markReviewed: (documentId: string) => Promise<void>
  retryJob: (jobId: string) => Promise<void>
  executeCampaign: (campaignId: string) => Promise<void>
  retryRightsRequest: (requestId: string) => Promise<void>
  resetDemo: () => Promise<void>
  dismissNotification: (id: string) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  clearNotifications: () => void
  pushNotification: (input: Omit<AppNotification, 'id' | 'at' | 'read'>) => void
}

const DemoContext = createContext<DemoContextValue | null>(null)

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong while loading the workspace.'
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    status: 'loading',
    data: null,
    error: null,
    refreshing: false,
  })
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS)
  const counter = useRef(0)

  const notify = useCallback(
    (input: Omit<AppNotification, 'id' | 'at' | 'read'>) => {
      counter.current += 1
      const notification: AppNotification = {
        ...input,
        id: `ntf-${Date.now()}-${counter.current}`,
        at: new Date().toISOString(),
        read: false,
      }
      setNotifications((current) => [notification, ...current].slice(0, 24))
    },
    [],
  )

  const handleError = useCallback(
    (error: unknown) => {
      const message = describeError(error)
      if (state.data) {
        notify({
          title: 'Request failed',
          body: message,
          tone: 'danger',
          appId: 'vault',
        })
        dispatch({ type: 'refreshing', refreshing: false })
        return
      }
      dispatch({ type: 'error', error: message })
    },
    [notify, state.data],
  )

  useEffect(() => {
    let cancelled = false
    demoRepository
      .load()
      .then((data) => {
        if (!cancelled) dispatch({ type: 'ready', data })
      })
      .catch((error: unknown) => {
        if (!cancelled) dispatch({ type: 'error', error: describeError(error) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    if (state.refreshing) return
    dispatch({ type: 'refreshing', refreshing: true })
    try {
      const data = await demoRepository.refresh()
      dispatch({ type: 'ready', data })
      notify({
        title: 'Workspace refreshed',
        body: 'Source health, records and governance totals were recalculated from the demo repository.',
        tone: 'info',
        appId: 'vault',
      })
    } catch (error) {
      handleError(error)
    }
  }, [handleError, notify, state.refreshing])

  const markReviewed = useCallback(
    async (documentId: string) => {
      try {
        const data = await demoRepository.markDocumentReviewed(documentId)
        dispatch({ type: 'ready', data })
        const document = data.documents.find((entry) => entry.id === documentId)
        if (document) {
          notify({
            title: 'Classification approved',
            body: `${document.name} is now marked as reviewed.`,
            tone: 'success',
            appId: 'vault',
          })
        }
      } catch (error) {
        handleError(error)
      }
    },
    [handleError, notify],
  )

  const retryJob = useCallback(
    async (jobId: string) => {
      try {
        const data = await demoRepository.retryJob(jobId)
        dispatch({ type: 'ready', data })
        const job = data.jobs.find((entry) => entry.id === jobId)
        if (job?.status === 'retrying') {
          notify({
            title: `Retry queued — ${job.name}`,
            body: `Attempt ${job.attempts} of ${job.maxAttempts} is queued. Progress will continue in the background.`,
            tone: 'info',
            appId: 'vault',
          })
        } else {
          notify({
            title: 'No retry available',
            body: 'This job is not in a failed state, so nothing was changed.',
            tone: 'warning',
            appId: 'vault',
          })
        }
      } catch (error) {
        handleError(error)
      }
    },
    [handleError, notify],
  )

  const executeCampaign = useCallback(
    async (campaignId: string) => {
      try {
        const data = await demoRepository.executeCampaign(campaignId)
        dispatch({ type: 'ready', data })
        const campaign = data.campaigns.find((entry) => entry.id === campaignId)
        const recipients = data.campaignRecipients.filter(
          (entry) => entry.campaignId === campaignId,
        )
        if (campaign?.status === 'complete') {
          notify({
            title: 'Approved recipients executed',
            body: `${recipients.filter((entry) => entry.status === 'sent').length} sent, ${recipients.filter((entry) => entry.status === 'held').length} held by policy.`,
            tone: 'success',
            appId: 'vault',
          })
        }
      } catch (error) {
        handleError(error)
      }
    },
    [handleError, notify],
  )

  const retryRightsRequest = useCallback(
    async (requestId: string) => {
      try {
        const data = await demoRepository.retryRightsRequest(requestId)
        dispatch({ type: 'ready', data })
        const request = data.rightsRequests.find((entry) => entry.id === requestId)
        if (request?.status === 'in-progress') {
          notify({
            title: `Retry queued — ${request.reference}`,
            body: 'Failed sources were reopened. No data has been deleted or changed yet.',
            tone: 'info',
            appId: 'vault',
          })
        }
      } catch (error) {
        handleError(error)
      }
    },
    [handleError, notify],
  )

  const resetDemo = useCallback(async () => {
    try {
      const data = await demoRepository.reset()
      dispatch({ type: 'ready', data })
      setNotifications(INITIAL_NOTIFICATIONS)
      notify({
        title: 'Demo reset complete',
        body: 'The deterministic dataset has been restored and all local changes were cleared.',
        tone: 'success',
        appId: 'vault',
      })
    } catch (error) {
      handleError(error)
    }
  }, [handleError, notify])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id))
  }, [])

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      ),
    )
  }, [])

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, read: true })),
    )
  }, [])

  const clearNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  const unreadCount = notifications.filter((notification) => !notification.read).length

  const value = useMemo<DemoContextValue>(
    () => ({
      status: state.status,
      data: state.data,
      error: state.error,
      refreshing: state.refreshing,
      mode: dataMode,
      apiBaseUrl: dataMode === 'api' ? apiBaseUrl : null,
      notifications,
      unreadCount,
      refresh,
      markReviewed,
      retryJob,
      executeCampaign,
      retryRightsRequest,
      resetDemo,
      dismissNotification,
      markNotificationRead,
      markAllNotificationsRead,
      clearNotifications,
      pushNotification: notify,
    }),
    [
      state.status,
      notify,
      state.data,
      state.error,
      state.refreshing,
      notifications,
      unreadCount,
      refresh,
      markReviewed,
      retryJob,
      executeCampaign,
      retryRightsRequest,
      resetDemo,
      dismissNotification,
      markNotificationRead,
      markAllNotificationsRead,
      clearNotifications,
      notify,
    ],
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export function useDemo(): DemoContextValue {
  const context = useContext(DemoContext)
  if (!context) throw new Error('useDemo must be used inside DemoProvider')
  return context
}
