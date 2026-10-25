import type { DemoData } from '@/domain/types'
import type { ContactMode } from './config'

export type DataMode = 'local' | 'api'

export interface EvaluatePolicyPayload {
  subjectRef: string
  purpose: string
  channel: string
  recordRefId?: string
}

export interface CampaignDraftPayload {
  name: string
  purpose?: string
  channel?: string
  templateId?: string
  importId?: string
  recordIds?: string[]
  subjectRef?: string
}

export interface CorrectionPayload {
  field: string
  requestedValue: string
  reason?: string
}

export interface RightsDraftPayload {
  subjectRef: string
  requestType: string
  requesterReference?: string
  correction?: CorrectionPayload
}

export interface HoldDraftPayload {
  subjectRef?: string
  sourceId?: string
  recordRefId?: string
  reasonCode?: string
  reviewNote?: string
  expiresAt?: string
}

export interface BreachDraftPayload {
  title: string
  description: string
  severity?: string
  subjectRefs?: string[]
  sourceIds?: string[]
  detectedAt?: string
  containmentSummary?: string
}

export interface BreachAssessmentPayload {
  notifiable: boolean
  reasonCode: string
  note?: string
}

/**
 * The single data boundary used by the UI. The HTTP implementation talks to the
 * versioned `/demo` facade; the local implementation keeps the offline fixture.
 */
export interface DemoRepository {
  setContactMode(mode: ContactMode): void
  load(): Promise<DemoData>
  refresh(): Promise<DemoData>
  reset(): Promise<DemoData>
  importFile(sourceId: string, file: File): Promise<DemoData>
  markDocumentReviewed(documentId: string): Promise<DemoData>
  evaluatePolicy(payload: EvaluatePolicyPayload): Promise<DemoData>
  createCampaign(payload: CampaignDraftPayload): Promise<DemoData>
  previewCampaign(campaignId: string): Promise<DemoData>
  executeCampaign(campaignId: string): Promise<DemoData>
  createRightsRequest(payload: RightsDraftPayload): Promise<DemoData>
  planRightsRequest(requestId: string): Promise<DemoData>
  executeRightsRequest(requestId: string): Promise<DemoData>
  retryRightsRequest(requestId: string): Promise<DemoData>
  createHold(payload: HoldDraftPayload): Promise<DemoData>
  releaseHold(holdId: string, note?: string): Promise<DemoData>
  retryJob(jobId: string): Promise<DemoData>
  verifyAudit(): Promise<DemoData>
  createCheckpoint(note?: string): Promise<DemoData>
  resolveIncident(incidentId: string, decision: string, note: string): Promise<DemoData>
  createBreach(payload: BreachDraftPayload): Promise<DemoData>
  assessBreach(breachId: string, payload: BreachAssessmentPayload): Promise<DemoData>
  draftBreachNotification(breachId: string): Promise<DemoData>
  closeBreach(breachId: string, note: string): Promise<DemoData>
  injectFailure(kind: string, targetId?: string): Promise<DemoData>
  clearFailures(): Promise<DemoData>
}
