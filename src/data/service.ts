import type { AuditEvent, DemoData, Job } from '@/domain/types'
import { eventDigest } from '@/lib/integrity'
import { HttpBusinessRepository } from './api-service'
import { apiBaseUrl } from './config'
import type { DemoRepository } from './repository'
import { createSeedData } from './synthetic'

export interface DemoServiceOptions {
  latencyMs?: number
}

function clone(data: DemoData): DemoData {
  return structuredClone(data)
}

function appendAudit(
  data: DemoData,
  event: Pick<AuditEvent, 'actor' | 'action' | 'target' | 'category' | 'severity'>,
): void {
  const prevHash = data.auditEvents[data.auditEvents.length - 1]?.hash ?? 'genesis'
  const base = {
    id: `aud-live-${data.auditEvents.length + 1}`,
    at: new Date().toISOString(),
    ...event,
    prevHash,
  }
  data.auditEvents.push({ ...base, hash: eventDigest(prevHash, base) })
}

/**
 * Async repository for the synthetic demo workspace. UI code only talks to this
 * service, so swapping the fixture store for HTTP calls later is a contained change.
 */
export class DemoDataService implements DemoRepository {
  private data: DemoData
  private latencyMs: number

  constructor(options: DemoServiceOptions = {}) {
    this.data = createSeedData()
    this.latencyMs = options.latencyMs ?? 420
  }

  private async settle<T>(value: T): Promise<T> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs))
    }
    return value
  }

  async load(): Promise<DemoData> {
    return this.settle(clone(this.data))
  }

  async refresh(): Promise<DemoData> {
    return this.settle(clone(this.data))
  }

  async markDocumentReviewed(documentId: string): Promise<DemoData> {
    const document = this.data.documents.find((entry) => entry.id === documentId)
    if (document) {
      document.reviewStatus = 'reviewed'
      document.confidence = Math.max(document.confidence, 0.96)
      appendAudit(this.data, {
        actor: 'Demo operator',
        action: `Classification review approved — ${document.name}`,
        target: document.name,
        category: 'policy',
        severity: 'info',
      })
    }
    return this.settle(clone(this.data))
  }

  async retryJob(jobId: string): Promise<DemoData> {
    const job = this.data.jobs.find((entry) => entry.id === jobId)
    if (job && job.status === 'failed') {
      if (job.attempts >= job.maxAttempts) job.maxAttempts = job.attempts + 1
      job.attempts += 1
      job.status = 'retrying'
      job.progress = 8
      job.startedAt = new Date().toISOString()
      job.finishedAt = undefined
      job.failureSummary = undefined
      job.timeline.push({
        at: new Date().toISOString(),
        label: `Manual retry requested (attempt ${job.attempts})`,
        tone: 'neutral',
      })
      appendAudit(this.data, {
        actor: 'Demo operator',
        action: `Job retry requested — ${job.name}`,
        target: job.name,
        category: 'system',
        severity: 'info',
      })
    }
    return this.settle(clone(this.data))
  }

  async executeCampaign(campaignId: string): Promise<DemoData> {
    const campaign = this.data.campaigns.find((entry) => entry.id === campaignId)
    if (campaign && campaign.status !== 'complete') {
      campaign.status = 'complete'
      for (const recipient of this.data.campaignRecipients) {
        if (recipient.campaignId !== campaignId) continue
        recipient.status = recipient.decision === 'approve' ? 'sent' : 'held'
      }
      appendAudit(this.data, {
        actor: 'Demo operator',
        action: `Approved recipients executed — ${campaign.name}`,
        target: campaign.name,
        category: 'policy',
        severity: 'info',
      })
    }
    return this.settle(clone(this.data))
  }

  async retryRightsRequest(requestId: string): Promise<DemoData> {
    const request = this.data.rightsRequests.find((entry) => entry.id === requestId)
    if (request) {
      let reopened = false
      for (const progress of request.sourceProgress) {
        if (progress.status === 'failed') {
          progress.status = 'pending'
          progress.detail = 'Retry queued; waiting for the source to respond.'
          reopened = true
        }
      }
      if (reopened) {
        request.status = 'in-progress'
        appendAudit(this.data, {
          actor: 'Demo operator',
          action: `Rights request ${request.reference} retry requested`,
          target: request.reference,
          category: 'rights',
          severity: 'warning',
        })
      }
    }
    return this.settle(clone(this.data))
  }

  async reset(): Promise<DemoData> {
    this.data = createSeedData()
    return this.settle(clone(this.data))
  }
}

export { apiBaseUrl, dataMode } from './config'

export const demoRepository: DemoRepository = apiBaseUrl
  ? new HttpBusinessRepository(apiBaseUrl)
  : new DemoDataService()

export function findJob(data: DemoData, jobId: string): Job | undefined {
  return data.jobs.find((job) => job.id === jobId)
}
