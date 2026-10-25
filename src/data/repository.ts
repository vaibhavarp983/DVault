import type { DemoData } from '@/domain/types'

export type DataMode = 'local' | 'api'

/**
 * The single data boundary used by the UI. Implementations may be the local
 * synthetic fixture or a FastAPI-backed repository.
 */
export interface DemoRepository {
  load(): Promise<DemoData>
  refresh(): Promise<DemoData>
  markDocumentReviewed(documentId: string): Promise<DemoData>
  retryJob(jobId: string): Promise<DemoData>
  executeCampaign(campaignId: string): Promise<DemoData>
  retryRightsRequest(requestId: string): Promise<DemoData>
  reset(): Promise<DemoData>
}
