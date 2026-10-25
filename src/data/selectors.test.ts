import { describe, expect, it } from 'vitest'
import { createSeedData } from './synthetic'
import {
  selectActivitySeries,
  selectAuditIntegrity,
  selectCampaignTotals,
  selectCustomerTrace,
  selectDocumentLibrary,
  selectFileTree,
  selectFolderByPath,
  selectGovernanceHealth,
  selectImportSummary,
  selectJobSummary,
  selectPolicySummary,
  selectRightsSummary,
  selectSourceSummaries,
} from './selectors'

const data = createSeedData()

describe('synthetic seed', () => {
  it('keeps cross-source totals consistent', () => {
    const summaries = selectSourceSummaries(data)
    const total = summaries.reduce((sum, entry) => sum + entry.documentCount, 0)
    expect(total).toBe(data.documents.length)
    expect(data.customers).toHaveLength(6)
    expect(data.sources).toHaveLength(5)
    expect(data.documents).toHaveLength(28)
  })

  it('marks every customer identity as synthetic', () => {
    expect(data.customers.every((customer) => customer.synthetic)).toBe(true)
    expect(data.customers.every((customer) => customer.email.endsWith('@synthetic.example'))).toBe(
      true,
    )
  })
})

describe('document library', () => {
  it('filters by search term across linked customer and source names', () => {
    const results = selectDocumentLibrary(data, { search: 'marsh' })
    expect(results.length).toBeGreaterThanOrEqual(4)
    expect(results.every((document) => document.customerId === 'cus-marsh')).toBe(true)
  })

  it('filters by source and import state together', () => {
    const results = selectDocumentLibrary(data, {
      sourceId: 'src-whatsapp',
      importStates: ['importing', 'missing'],
    })
    expect(results).toHaveLength(2)
    expect(results.every((document) => document.sourceId === 'src-whatsapp')).toBe(true)
  })

  it('counts import states', () => {
    const summary = selectImportSummary(data)
    const total = Object.values(summary).reduce((sum, value) => sum + value, 0)
    expect(total).toBe(data.documents.length)
    expect(summary.failed).toBe(2)
  })
})

describe('governance summaries', () => {
  it('computes a bounded governance score from four weighted factors', () => {
    const health = selectGovernanceHealth(data)
    expect(health.score).toBeGreaterThan(0)
    expect(health.score).toBeLessThan(100)
    expect(health.factors).toHaveLength(4)
    expect(health.factors.reduce((sum, factor) => sum + factor.weight, 0)).toBeCloseTo(1)
    expect(health.issueCount).toBeGreaterThan(0)
  })

  it('aggregates policy outcomes', () => {
    const policy = selectPolicySummary(data)
    expect(policy.total).toBe(10)
    expect(policy.allow + policy.review + policy.deny).toBe(10)
    expect(policy.allowShare + policy.reviewShare + policy.denyShare).toBeCloseTo(100)
  })

  it('flags requests that are due within a week', () => {
    const rights = selectRightsSummary(data)
    expect(rights.dueSoon).toBe(1)
    expect(rights.failedSources).toBe(1)
    expect(rights.total).toBe(4)
  })

  it('summarises jobs by status', () => {
    const jobs = selectJobSummary(data)
    expect(jobs.running).toBe(2)
    expect(jobs.failed).toBe(1)
    expect(jobs.completed).toBe(2)
  })

  it('verifies the sealed audit chain', () => {
    const integrity = selectAuditIntegrity(data)
    expect(integrity.valid).toBe(true)
    expect(integrity.verifiedCount).toBe(10)
    expect(integrity.checkpoints).toHaveLength(2)
  })

  it('builds a 14 point activity series', () => {
    const series = selectActivitySeries(data)
    expect(series).toHaveLength(14)
    expect(series.reduce((sum, point) => sum + point.value, 0)).toBeGreaterThan(0)
  })
})

describe('campaigns and relationships', () => {
  it('totals campaign decisions and executable recipients', () => {
    const totals = selectCampaignTotals(data, 'cmp-autumn')
    expect(totals.decisions).toEqual({ approve: 3, review: 2, block: 1 })
    expect(totals.executable).toBe(3)
    expect(totals.sent).toBe(0)
  })

  it('traces one customer across documents, policies, rights and campaigns', () => {
    const trace = selectCustomerTrace(data, 'cus-marsh')
    expect(trace.customer?.company).toBe('Marsh Legal')
    expect(trace.documents).toHaveLength(5)
    expect(trace.rightsRequests).toHaveLength(1)
    expect(trace.recipients).toHaveLength(1)
    expect(trace.policies.length).toBeGreaterThan(0)
  })
})

describe('file tree', () => {
  it('places every document exactly once', () => {
    const root = selectFileTree(data)
    const countFiles = (folder: ReturnType<typeof selectFileTree>): number =>
      (folder.children ?? []).reduce(
        (total, child) => total + (child.kind === 'file' ? 1 : countFiles(child as never)),
        0,
      )
    expect(countFiles(root)).toBe(data.documents.length)
  })

  it('resolves nested folders by display path', () => {
    const root = selectFileTree(data)
    const finance = selectFolderByPath(root, 'Finance')
    expect(finance?.name).toBe('Finance')
    expect(finance?.children?.map((child) => child.name)).toEqual([
      'Invoices',
      'Purchase orders',
    ])
  })
})
