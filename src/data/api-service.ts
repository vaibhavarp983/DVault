import type { DemoData } from '@/domain/types'
import type { DemoRepository } from './repository'
import { requestJson, type RequestOptions } from './http'

export { ApiError } from './http'

/**
 * Business portal HTTP repository.
 *
 * Contract (all endpoints return the complete business snapshot):
 *   GET  /business
 *   POST /business/refresh
 *   POST /business/reset
 *   POST /business/documents/{id}/review
 *   POST /business/jobs/{id}/retry
 *   POST /business/campaigns/{id}/execute
 *   POST /business/rights-requests/{id}/retry
 */
export class HttpBusinessRepository implements DemoRepository {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  private request(path: string, options: RequestOptions = {}): Promise<DemoData> {
    return requestJson<DemoData>(this.baseUrl, path, options)
  }

  load(): Promise<DemoData> {
    return this.request('/business')
  }

  refresh(): Promise<DemoData> {
    return this.request('/business/refresh', { method: 'POST' })
  }

  reset(): Promise<DemoData> {
    return this.request('/business/reset', { method: 'POST' })
  }

  markDocumentReviewed(documentId: string): Promise<DemoData> {
    return this.request(`/business/documents/${encodeURIComponent(documentId)}/review`, {
      method: 'POST',
      body: { reviewStatus: 'reviewed' },
    })
  }

  retryJob(jobId: string): Promise<DemoData> {
    return this.request(`/business/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
    })
  }

  executeCampaign(campaignId: string): Promise<DemoData> {
    return this.request(`/business/campaigns/${encodeURIComponent(campaignId)}/execute`, {
      method: 'POST',
    })
  }

  retryRightsRequest(requestId: string): Promise<DemoData> {
    return this.request(
      `/business/rights-requests/${encodeURIComponent(requestId)}/retry`,
      { method: 'POST' },
    )
  }
}
