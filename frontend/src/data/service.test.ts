import { describe, expect, it } from 'vitest'
import { DemoDataService } from './service'

const makeService = () => new DemoDataService({ latencyMs: 0 })

describe('demo data service', () => {
  it('loads asynchronously and returns an isolated snapshot', async () => {
    const service = makeService()
    const first = await service.load()
    first.documents[0].name = 'mutated'
    const second = await service.load()
    expect(second.documents[0]?.name).not.toBe('mutated')
  })

  it('marks a document reviewed and appends an audit event', async () => {
    const service = makeService()
    const before = await service.load()
    const target = before.documents.find((document) => document.reviewStatus === 'needs-review')
    expect(target).toBeDefined()
    const after = await service.markDocumentReviewed(target!.id)
    const updated = after.documents.find((document) => document.id === target!.id)
    expect(updated?.reviewStatus).toBe('reviewed')
    expect(updated?.confidence).toBeGreaterThanOrEqual(0.96)
    expect(after.auditEvents).toHaveLength(before.auditEvents.length + 1)
  })

  it('retries a failed job and extends the attempt budget', async () => {
    const service = makeService()
    const before = await service.load()
    const failed = before.jobs.find((job) => job.status === 'failed')!
    const after = await service.retryJob(failed.id)
    const retried = after.jobs.find((job) => job.id === failed.id)!
    expect(retried.status).toBe('retrying')
    expect(retried.attempts).toBe(failed.attempts + 1)
    expect(retried.maxAttempts).toBeGreaterThanOrEqual(retried.attempts)
    expect(retried.failureSummary).toBeUndefined()
    expect(retried.timeline.at(-1)?.label).toMatch(/Manual retry/)
  })

  it('does not retry a job that has not failed', async () => {
    const service = makeService()
    const before = await service.load()
    const running = before.jobs.find((job) => job.status === 'running')!
    const after = await service.retryJob(running.id)
    expect(after.jobs.find((job) => job.id === running.id)?.status).toBe('running')
  })

  it('executes only approved campaign recipients', async () => {
    const service = makeService()
    const after = await service.executeCampaign('cmp-autumn')
    const campaign = after.campaigns.find((entry) => entry.id === 'cmp-autumn')
    expect(campaign?.status).toBe('complete')
    expect(after.campaignRecipients.filter((entry) => entry.status === 'sent')).toHaveLength(3)
    expect(after.campaignRecipients.filter((entry) => entry.status === 'held')).toHaveLength(3)
  })

  it('reopens failed rights-request sources', async () => {
    const service = makeService()
    const after = await service.retryRightsRequest('rr-2081')
    const request = after.rightsRequests.find((entry) => entry.id === 'rr-2081')!
    expect(request.status).toBe('in-progress')
    expect(request.sourceProgress.some((progress) => progress.status === 'failed')).toBe(false)
  })

  it('restores the deterministic seed on reset', async () => {
    const service = makeService()
    await service.markDocumentReviewed('doc-inv-1042')
    const reset = await service.reset()
    const fresh = await service.load()
    expect(reset.auditEvents).toHaveLength(10)
    expect(fresh.documents).toEqual(reset.documents)
    expect(fresh.auditEvents).toHaveLength(10)
  })
})
