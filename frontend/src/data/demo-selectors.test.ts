import { describe, expect, it } from 'vitest'
import { createSeedData } from './synthetic'
import { selectAuditIntegrity } from './selectors'

describe('server integrity projection', () => {
  it('uses the server verification block when present', () => {
    const data = createSeedData()
    data.integrity = {
      status: 'failed',
      evidenceState: 'UNTRUSTED',
      trustedThroughSequence: 3,
      failureSequence: 4,
      reasonCode: 'CHAIN_EVENT_EDITED',
      failures: [{ sequence: 4, reason_code: 'CHAIN_EVENT_EDITED', detail: 'edited' }],
      gateState: 'BLOCKED',
      incidentId: 'incident-1',
      checkpointStatus: 'UNCHECKED',
      verifiedAt: '2026-10-25T08:00:00Z',
      disclaimer: 'Consistency only.',
      incidents: [],
      breachCounts: {},
    }
    data.checkpoints = data.checkpoints.map((checkpoint, index) => ({
      ...checkpoint,
      status: index === 0 ? 'verified' : checkpoint.status,
    }))

    const result = selectAuditIntegrity(data)

    expect(result.valid).toBe(false)
    expect(result.verifiedCount).toBe(3)
    expect(result.brokenAt).toBe('4')
    expect(result.checkpoints[0].status).toBe('failed')
  })

  it('falls back to the local FNV chain when the server block is absent', () => {
    const data = createSeedData()
    delete data.integrity
    const result = selectAuditIntegrity(data)
    expect(result.valid).toBe(true)
    expect(result.verifiedCount).toBe(data.auditEvents.length)
  })
})
