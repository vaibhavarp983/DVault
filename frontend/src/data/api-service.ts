import type { DemoData } from '@/domain/types'
import { demoApiPrefix, type ContactMode } from './config'
import { requestJson, type RequestOptions } from './http'
import type {
  BreachAssessmentPayload,
  BreachDraftPayload,
  CampaignDraftPayload,
  CreateConversationPayload,
  DemoRepository,
  EvaluatePolicyPayload,
  HoldDraftPayload,
  RetentionPolicyPayload,
  RetentionTierPayload,
  RightsDraftPayload,
} from './repository'
import type { WithdrawalTierKey } from '@/domain/messaging'

export { ApiError } from './http'

/**
 * The API can return `modifiedAt: null` for imports that never completed. The UI
 * treats document dates as strings, so substitute the creation timestamp (or the
 * snapshot timestamp) before the data reaches any component.
 */
function normalizeSnapshot(data: DemoData): DemoData {
  const fallback = data.generatedAt ?? data.seededAt
  return {
    ...data,
    documents: data.documents.map((document) => ({
      ...document,
      modifiedAt:
        (document.modifiedAt as string | null | undefined) ??
        document.createdAt ??
        fallback,
    })),
  }
}

/**
 * Frontend integration repository.
 *
 * Reads and actions target the versioned demo facade:
 *   GET  /api/v1/workspaces/{ref}/demo
 *   POST /api/v1/workspaces/{ref}/demo/{action}
 *
 * Every response is the complete persisted snapshot for the workspace.
 */
export class HttpBusinessRepository implements DemoRepository {
  private readonly baseUrl: string
  private contactMode: ContactMode = 'masked'

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  setContactMode(mode: ContactMode): void {
    this.contactMode = mode
  }

  private request(path: string, options: RequestOptions = {}): Promise<DemoData> {
    return requestJson<DemoData>(this.baseUrl, `${demoApiPrefix}${path}`, {
      ...options,
      query: { contacts: this.contactMode, ...options.query },
    }).then(normalizeSnapshot)
  }

  load(): Promise<DemoData> {
    return this.request('')
  }

  refresh(): Promise<DemoData> {
    return this.request('/refresh', { method: 'POST' })
  }

  reset(): Promise<DemoData> {
    return this.request('/reset', { method: 'POST', timeoutMs: 60_000 })
  }

  importFile(sourceId: string, file: File): Promise<DemoData> {
    const form = new FormData()
    form.append('source_id', sourceId)
    form.append('file', file)
    return this.request('/imports', {
      method: 'POST',
      formData: form,
      timeoutMs: 60_000,
    })
  }

  markDocumentReviewed(documentId: string): Promise<DemoData> {
    return this.request(`/documents/${encodeURIComponent(documentId)}/review`, {
      method: 'POST',
    })
  }

  evaluatePolicy(payload: EvaluatePolicyPayload): Promise<DemoData> {
    return this.request('/policies/evaluate', { method: 'POST', body: payload })
  }

  createCampaign(payload: CampaignDraftPayload): Promise<DemoData> {
    return this.request('/campaigns', { method: 'POST', body: payload })
  }

  previewCampaign(campaignId: string): Promise<DemoData> {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/preview`, {
      method: 'POST',
    })
  }

  executeCampaign(campaignId: string): Promise<DemoData> {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/execute`, {
      method: 'POST',
    })
  }

  createRightsRequest(payload: RightsDraftPayload): Promise<DemoData> {
    return this.request('/rights-requests', { method: 'POST', body: payload })
  }

  planRightsRequest(requestId: string): Promise<DemoData> {
    return this.request(`/rights-requests/${encodeURIComponent(requestId)}/plan`, {
      method: 'POST',
    })
  }

  executeRightsRequest(requestId: string): Promise<DemoData> {
    return this.request(`/rights-requests/${encodeURIComponent(requestId)}/execute`, {
      method: 'POST',
    })
  }

  retryRightsRequest(requestId: string): Promise<DemoData> {
    return this.request(`/rights-requests/${encodeURIComponent(requestId)}/retry`, {
      method: 'POST',
    })
  }

  createHold(payload: HoldDraftPayload): Promise<DemoData> {
    return this.request('/retention-holds', { method: 'POST', body: payload })
  }

  releaseHold(holdId: string, note?: string): Promise<DemoData> {
    return this.request(`/retention-holds/${encodeURIComponent(holdId)}/release`, {
      method: 'POST',
      body: { note },
    })
  }

  retryJob(jobId: string): Promise<DemoData> {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' })
  }

  verifyAudit(): Promise<DemoData> {
    return this.request('/audit/verify', { method: 'POST' })
  }

  createCheckpoint(note?: string): Promise<DemoData> {
    return this.request('/audit/checkpoints', { method: 'POST', body: { note } })
  }

  resolveIncident(incidentId: string, decision: string, note: string): Promise<DemoData> {
    return this.request(
      `/integrity-incidents/${encodeURIComponent(incidentId)}/resolve`,
      { method: 'POST', body: { decision, note } },
    )
  }

  createBreach(payload: BreachDraftPayload): Promise<DemoData> {
    return this.request('/breaches', { method: 'POST', body: payload })
  }

  assessBreach(breachId: string, payload: BreachAssessmentPayload): Promise<DemoData> {
    return this.request(`/breaches/${encodeURIComponent(breachId)}/assessment`, {
      method: 'POST',
      body: payload,
    })
  }

  draftBreachNotification(breachId: string): Promise<DemoData> {
    return this.request(
      `/breaches/${encodeURIComponent(breachId)}/notification-draft`,
      { method: 'POST' },
    )
  }

  closeBreach(breachId: string, note: string): Promise<DemoData> {
    return this.request(`/breaches/${encodeURIComponent(breachId)}/close`, {
      method: 'POST',
      body: { note },
    })
  }

  injectFailure(kind: string, targetId?: string): Promise<DemoData> {
    return this.request('/failures', { method: 'POST', body: { kind, targetId } })
  }

  clearFailures(): Promise<DemoData> {
    return this.request('/failures/clear', { method: 'POST' })
  }

  createConversation(payload: CreateConversationPayload): Promise<DemoData> {
    return this.request('/conversations', { method: 'POST', body: payload })
  }

  sendMessage(conversationId: string, body: string): Promise<DemoData> {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: { body },
    })
  }

  markConversationRead(conversationId: string): Promise<DemoData> {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
    })
  }

  archiveConversation(conversationId: string): Promise<DemoData> {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/archive`, {
      method: 'POST',
    })
  }

  verifyConversation(conversationId: string): Promise<DemoData> {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/verify`, {
      method: 'POST',
    })
  }

  verifyMessages(): Promise<DemoData> {
    return this.request('/message-integrity/verify', { method: 'POST' })
  }

  updateRetentionPolicy(payload: RetentionPolicyPayload): Promise<DemoData> {
    return this.request('/retention-policy', { method: 'POST', body: payload })
  }

  runRetention(): Promise<DemoData> {
    return this.request('/retention/run', { method: 'POST' })
  }

  updateWithdrawalTier(
    key: WithdrawalTierKey,
    payload: RetentionTierPayload,
  ): Promise<DemoData> {
    return this.request(`/withdrawal-tiers/${encodeURIComponent(key)}`, {
      method: 'POST',
      body: payload,
    })
  }
}
