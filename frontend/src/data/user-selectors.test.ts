import { describe, expect, it } from 'vitest'
import { createUserSeed } from './user-synthetic'
import {
  selectConsentHealth,
  selectOpenRequests,
  selectUserDocuments,
  selectUserSourceCounts,
  selectUserSummary,
} from './user-selectors'

const workspace = createUserSeed()

describe('user seed', () => {
  it('uses one synthetic identity', () => {
    expect(workspace.profile.synthetic).toBe(true)
    expect(workspace.profile.email).toBe('rowan.ellis@synthetic.example')
    expect(workspace.notice).toContain('synthetic')
  })

  it('has a coherent footprint', () => {
    expect(workspace.sources).toHaveLength(4)
    expect(workspace.documents).toHaveLength(8)
    expect(workspace.consents).toHaveLength(5)
    expect(workspace.requests).toHaveLength(3)
    expect(workspace.activity.length).toBeGreaterThanOrEqual(8)
  })
})

describe('user selectors', () => {
  it('summarises consents, requests and records', () => {
    const summary = selectUserSummary(workspace)
    expect(summary.sources).toBe(4)
    expect(summary.records).toBe(8)
    expect(summary.activeConsents).toBe(2)
    expect(summary.optionalConsents).toBe(4)
    expect(summary.requiredConsents).toBe(1)
    expect(summary.openRequests).toBe(2)
    expect(summary.failedRequests).toBe(1)
    expect(summary.completeRequests).toBe(1)
  })

  it('computes optional consent health', () => {
    const health = selectConsentHealth(workspace)
    expect(health.active).toBe(2)
    expect(health.total).toBe(4)
    expect(health.percent).toBe(50)
  })

  it('orders open requests by due date', () => {
    const open = selectOpenRequests(workspace)
    expect(open.map((request) => request.reference)).toEqual(['U-1042', 'U-1046'])
  })

  it('filters documents by source and text', () => {
    expect(selectUserDocuments(workspace, { sourceId: 'usrc-messaging' })).toHaveLength(1)
    expect(selectUserDocuments(workspace, { search: 'invoice' })).toHaveLength(2)
    expect(selectUserDocuments(workspace, { search: 'delivery' })).toHaveLength(1)
    expect(selectUserDocuments(workspace, { search: 'nothing-matches' })).toHaveLength(0)
  })

  it('counts records per source', () => {
    const counts = selectUserSourceCounts(workspace)
    expect(counts.get('usrc-drive')).toBe(3)
    expect(counts.get('usrc-billing')).toBe(2)
    expect(counts.get('usrc-messaging')).toBe(1)
    expect(counts.get('usrc-forms')).toBe(2)
  })

  it('sorts activity newest first', () => {
    const activity = [...workspace.activity].sort((a, b) => b.at.localeCompare(a.at))
    expect(activity[0]?.at.startsWith('2026-10-23')).toBe(true)
  })
})
