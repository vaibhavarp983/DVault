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
import {
  apiBaseUrl,
  dataMode,
  defaultContactMode,
  demoControlsEnabled,
  type ContactMode,
} from '@/data/config'
import type {
  BreachAssessmentPayload,
  BreachDraftPayload,
  CampaignDraftPayload,
  DataMode,
  EvaluatePolicyPayload,
  HoldDraftPayload,
  RightsDraftPayload,
} from '@/data/repository'
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
    body: 'A source action is unresolved. Open the Rights Queue to review it.',
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
  contactMode: ContactMode
  demoControlsEnabled: boolean
  notifications: AppNotification[]
  unreadCount: number
  refresh: () => Promise<void>
  setContactMode: (mode: ContactMode) => Promise<void>
  importDocument: (sourceId: string, file: File) => Promise<void>
  markReviewed: (documentId: string) => Promise<void>
  evaluatePolicy: (payload: EvaluatePolicyPayload) => Promise<void>
  createCampaign: (payload: CampaignDraftPayload) => Promise<void>
  previewCampaign: (campaignId: string) => Promise<void>
  executeCampaign: (campaignId: string) => Promise<void>
  createRightsRequest: (payload: RightsDraftPayload) => Promise<void>
  planRightsRequest: (requestId: string) => Promise<void>
  executeRightsRequest: (requestId: string) => Promise<void>
  retryRightsRequest: (requestId: string) => Promise<void>
  createHold: (payload: HoldDraftPayload) => Promise<void>
  releaseHold: (holdId: string, note?: string) => Promise<void>
  retryJob: (jobId: string) => Promise<void>
  verifyAudit: () => Promise<void>
  createCheckpoint: (note?: string) => Promise<void>
  resolveIncident: (incidentId: string, decision: string, note: string) => Promise<void>
  createBreach: (payload: BreachDraftPayload) => Promise<void>
  assessBreach: (breachId: string, payload: BreachAssessmentPayload) => Promise<void>
  draftBreachNotification: (breachId: string) => Promise<void>
  closeBreach: (breachId: string, note: string) => Promise<void>
  injectFailure: (kind: string, targetId?: string) => Promise<void>
  clearFailures: () => Promise<void>
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
  const [contactMode, setContactModeState] = useState<ContactMode>(defaultContactMode)
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

  const apply = useCallback(
    async (action: () => Promise<DemoData>, success?: (data: DemoData) => void) => {
      dispatch({ type: 'refreshing', refreshing: true })
      try {
        const data = await action()
        dispatch({ type: 'ready', data })
        success?.(data)
      } catch (error) {
        handleError(error)
      }
    },
    [handleError],
  )

  useEffect(() => {
    let cancelled = false
    demoRepository.setContactMode(defaultContactMode)
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
    await apply(
      () => demoRepository.refresh(),
      (data) =>
        notify({
          title: 'Workspace refreshed',
          body:
            data.integrity?.status === 'verified'
              ? 'Persisted state and the signed evidence chain were re-verified.'
              : 'Persisted state was reloaded. Review the Security Center for evidence status.',
          tone: 'info',
          appId: 'vault',
        }),
    )
  }, [apply, notify, state.refreshing])

  const setContactMode = useCallback(
    async (mode: ContactMode) => {
      demoRepository.setContactMode(mode)
      setContactModeState(mode)
      await apply(() => demoRepository.load())
    },
    [apply],
  )

  const importDocument = useCallback(
    async (sourceId: string, file: File) => {
      await apply(
        () => demoRepository.importFile(sourceId, file),
        (data) =>
          notify({
            title: 'Document imported',
            body: `${file.name} is now part of ${data.documents.length} catalogued documents.`,
            tone: 'success',
            appId: 'vault',
          }),
      )
    },
    [apply, notify],
  )

  const markReviewed = useCallback(
    async (documentId: string) => {
      await apply(
        () => demoRepository.markDocumentReviewed(documentId),
        (data) => {
          const document = data.documents.find((entry) => entry.id === documentId)
          notify({
            title: 'Classification approved',
            body: document ? `${document.name} is now marked as reviewed.` : 'Classification review saved.',
            tone: 'success',
            appId: 'vault',
          })
        },
      )
    },
    [apply, notify],
  )

  const evaluatePolicy = useCallback(
    async (payload: EvaluatePolicyPayload) => {
      await apply(
        () => demoRepository.evaluatePolicy(payload),
        (data) =>
          notify({
            title: 'Policy evaluation recorded',
            body: `The ledger now holds ${data.policies.length} persisted decisions.`,
            tone: 'success',
            appId: 'vault',
          }),
      )
    },
    [apply, notify],
  )

  const createCampaign = useCallback(
    async (payload: CampaignDraftPayload) => {
      await apply(
        () => demoRepository.createCampaign(payload),
        (data) =>
          notify({
            title: 'Campaign drafted',
            body: `${data.campaigns[0]?.name ?? payload.name} is ready for a policy preview.`,
            tone: 'success',
            appId: 'vault',
          }),
      )
    },
    [apply, notify],
  )

  const previewCampaign = useCallback(
    async (campaignId: string) => {
      await apply(
        () => demoRepository.previewCampaign(campaignId),
        (data) => {
          const recipients = data.campaignRecipients.filter((entry) => entry.campaignId === campaignId)
          notify({
            title: 'Policy preview complete',
            body: `${recipients.filter((entry) => entry.decision === 'approve').length} approved, ${recipients.filter((entry) => entry.decision === 'review').length} review, ${recipients.filter((entry) => entry.decision === 'block').length} blocked.`,
            tone: 'info',
            appId: 'vault',
          })
        },
      )
    },
    [apply, notify],
  )

  const executeCampaign = useCallback(
    async (campaignId: string) => {
      await apply(
        () => demoRepository.executeCampaign(campaignId),
        (data) => {
          const recipients = data.campaignRecipients.filter((entry) => entry.campaignId === campaignId)
          notify({
            title: 'Approved recipients executed',
            body: `${recipients.filter((entry) => entry.status === 'sent').length} sent, ${recipients.filter((entry) => entry.status === 'held').length} held by policy.`,
            tone: 'success',
            appId: 'vault',
          })
        },
      )
    },
    [apply, notify],
  )

  const createRightsRequest = useCallback(
    async (payload: RightsDraftPayload) => {
      await apply(
        () => demoRepository.createRightsRequest(payload),
        (data) => {
          const request = data.rightsRequests[0]
          notify({
            title: 'Rights request created',
            body: request ? `${request.reference} is planned for ${request.sourceProgress.length} source actions.` : 'Request created.',
            tone: 'success',
            appId: 'vault',
          })
        },
      )
    },
    [apply, notify],
  )

  const planRightsRequest = useCallback(
    async (requestId: string) => {
      await apply(
        () => demoRepository.planRightsRequest(requestId),
        (data) => {
          const request = data.rightsRequests.find((entry) => entry.id === requestId)
          notify({ title: 'Request planned', body: request ? `${request.reference} has ${request.sourceProgress.length} source actions.` : 'Request planned.', tone: 'info', appId: 'vault' })
        },
      )
    },
    [apply, notify],
  )

  const executeRightsRequest = useCallback(
    async (requestId: string) => {
      await apply(
        () => demoRepository.executeRightsRequest(requestId),
        (data) => {
          const request = data.rightsRequests.find((entry) => entry.id === requestId)
          notify({
            title: 'Request executed',
            body: request ? `${request.reference} is ${request.status}.` : 'Request executed.',
            tone: request?.status === 'complete' ? 'success' : 'warning',
            appId: 'vault',
          })
        },
      )
    },
    [apply, notify],
  )

  const retryRightsRequest = useCallback(
    async (requestId: string) => {
      await apply(
        () => demoRepository.retryRightsRequest(requestId),
        (data) => {
          const request = data.rightsRequests.find((entry) => entry.id === requestId)
          notify({
            title: 'Retry queued',
            body: request ? `${request.reference} is ${request.status}. Completed sources were not repeated.` : 'Retry queued.',
            tone: 'info',
            appId: 'vault',
          })
        },
      )
    },
    [apply, notify],
  )

  const createHold = useCallback(
    async (payload: HoldDraftPayload) => {
      await apply(
        () => demoRepository.createHold(payload),
        () => notify({ title: 'Retention hold created', body: 'Erasure actions for the scoped records will route to review.', tone: 'warning', appId: 'vault' }),
      )
    },
    [apply, notify],
  )

  const releaseHold = useCallback(
    async (holdId: string, note?: string) => {
      await apply(
        () => demoRepository.releaseHold(holdId, note),
        () => notify({ title: 'Retention hold released', body: 'Only previously restricted erasure actions can now be retried.', tone: 'success', appId: 'vault' }),
      )
    },
    [apply, notify],
  )

  const retryJob = useCallback(
    async (jobId: string) => {
      await apply(
        () => demoRepository.retryJob(jobId),
        (data) => {
          const job = data.jobs.find((entry) => entry.id === jobId)
          notify({ title: 'Job retry requested', body: job ? `${job.name} is ${job.status}.` : 'Retry requested.', tone: 'info', appId: 'vault' })
        },
      )
    },
    [apply, notify],
  )

  const verifyAudit = useCallback(
    async () => {
      await apply(
        () => demoRepository.verifyAudit(),
        (data) =>
          notify({
            title: data.integrity?.status === 'verified' ? 'Evidence verified' : 'Evidence integrity issue',
            body: data.integrity?.verifiedAt
              ? `Trusted through sequence ${data.integrity.trustedThroughSequence ?? 0}.`
              : 'Verification completed.',
            tone: data.integrity?.status === 'verified' ? 'success' : 'danger',
            appId: 'vault',
          }),
      )
    },
    [apply, notify],
  )

  const createCheckpoint = useCallback(
    async (note?: string) => {
      await apply(
        () => demoRepository.createCheckpoint(note),
        () => notify({ title: 'Checkpoint signed', body: 'The current verified head is now anchored by a new Ed25519 checkpoint.', tone: 'success', appId: 'vault' }),
      )
    },
    [apply, notify],
  )

  const resolveIncident = useCallback(
    async (incidentId: string, decision: string, note: string) => {
      await apply(
        () => demoRepository.resolveIncident(incidentId, decision, note),
        () => notify({ title: 'Integrity incident reviewed', body: `Decision recorded: ${decision}.`, tone: 'info', appId: 'vault' }),
      )
    },
    [apply, notify],
  )

  const createBreach = useCallback(
    async (payload: BreachDraftPayload) => {
      await apply(
        () => demoRepository.createBreach(payload),
        (data) => notify({ title: 'Breach incident registered', body: `${data.breaches?.[0]?.incidentRef ?? 'Incident'} is ready for assessment.`, tone: 'warning', appId: 'vault' }),
      )
    },
    [apply, notify],
  )

  const assessBreach = useCallback(
    async (breachId: string, payload: BreachAssessmentPayload) => {
      await apply(
        () => demoRepository.assessBreach(breachId, payload),
        () => notify({ title: 'Breach assessed', body: 'The 72-hour assessment outcome was recorded.', tone: 'info', appId: 'vault' }),
      )
    },
    [apply, notify],
  )

  const draftBreachNotification = useCallback(
    async (breachId: string) => {
      await apply(
        () => demoRepository.draftBreachNotification(breachId),
        () => notify({ title: 'Draft notification generated', body: 'The draft is labelled DRAFT — NOT SENT and was not transmitted.', tone: 'info', appId: 'vault' }),
      )
    },
    [apply, notify],
  )

  const closeBreach = useCallback(
    async (breachId: string, note: string) => {
      await apply(
        () => demoRepository.closeBreach(breachId, note),
        () => notify({ title: 'Breach closed', body: 'The review note and closure were persisted.', tone: 'success', appId: 'vault' }),
      )
    },
    [apply, notify],
  )

  const injectFailure = useCallback(
    async (kind: string, targetId?: string) => {
      await apply(
        () => demoRepository.injectFailure(kind, targetId),
        (data) =>
          notify({
            title: 'Rehearsal failure injected',
            body: data.integrity?.status === 'failed' ? 'Evidence is now untrusted; dispatch and rights execution are blocked.' : `${kind} is now active in the synthetic workspace.`,
            tone: 'danger',
            appId: 'vault',
          }),
      )
    },
    [apply, notify],
  )

  const clearFailures = useCallback(async () => {
    await apply(
      () => demoRepository.clearFailures(),
      (data) =>
        notify({
          title: 'Rehearsal failure cleared',
          body: data.integrity?.status === 'verified' ? 'The evidence chain verifies again.' : 'Demo failure records were cleared.',
          tone: 'success',
          appId: 'vault',
        }),
    )
  }, [apply, notify])

  const resetDemo = useCallback(async () => {
    await apply(
      () => demoRepository.reset(),
      () => {
        setNotifications(INITIAL_NOTIFICATIONS)
        notify({
          title: 'Demo reset complete',
          body: 'The synthetic workspace, rights, jobs, evidence chain and checkpoint were restored.',
          tone: 'success',
          appId: 'vault',
        })
      },
    )
  }, [apply, notify])

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
      contactMode,
      demoControlsEnabled,
      notifications,
      unreadCount,
      refresh,
      setContactMode,
      importDocument,
      markReviewed,
      evaluatePolicy,
      createCampaign,
      previewCampaign,
      executeCampaign,
      createRightsRequest,
      planRightsRequest,
      executeRightsRequest,
      retryRightsRequest,
      createHold,
      releaseHold,
      retryJob,
      verifyAudit,
      createCheckpoint,
      resolveIncident,
      createBreach,
      assessBreach,
      draftBreachNotification,
      closeBreach,
      injectFailure,
      clearFailures,
      resetDemo,
      dismissNotification,
      markNotificationRead,
      markAllNotificationsRead,
      clearNotifications,
      pushNotification: notify,
    }),
    [
      state.status,
      state.data,
      state.error,
      state.refreshing,
      contactMode,
      notifications,
      unreadCount,
      refresh,
      setContactMode,
      importDocument,
      markReviewed,
      evaluatePolicy,
      createCampaign,
      previewCampaign,
      executeCampaign,
      createRightsRequest,
      planRightsRequest,
      executeRightsRequest,
      retryRightsRequest,
      createHold,
      releaseHold,
      retryJob,
      verifyAudit,
      createCheckpoint,
      resolveIncident,
      createBreach,
      assessBreach,
      draftBreachNotification,
      closeBreach,
      injectFailure,
      clearFailures,
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
