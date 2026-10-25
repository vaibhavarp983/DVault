import { describe, expect, it } from 'vitest'
import { createSeedData } from '@/data/synthetic'
import { eventDigest, fnv1a, sealAuditChain, verifyAuditChain } from './integrity'

describe('integrity helpers', () => {
  it('is deterministic', () => {
    expect(fnv1a('dvault')).toBe(fnv1a('dvault'))
    expect(fnv1a('dvault')).not.toBe(fnv1a('dvault '))
  })

  it('seals and verifies a chain', () => {
    const events = sealAuditChain([
      {
        id: 'e1',
        at: '2026-10-24T09:00:00Z',
        actor: 'System',
        action: 'Seed',
        target: 'workspace',
        category: 'system',
        severity: 'info',
      },
      {
        id: 'e2',
        at: '2026-10-24T09:05:00Z',
        actor: 'System',
        action: 'Sync',
        target: 'drive',
        category: 'access',
        severity: 'info',
      },
    ])
    expect(events[0]?.prevHash).toBe('genesis')
    expect(events[1]?.prevHash).toBe(events[0]?.hash)
    expect(verifyAuditChain(events).valid).toBe(true)
    expect(verifyAuditChain(events).verifiedCount).toBe(2)
  })

  it('detects tampering and reports where the chain broke', () => {
    const data = createSeedData()
    const events = structuredClone(data.auditEvents)
    events[4] = { ...events[4], action: 'Tampered action' }
    const result = verifyAuditChain(events, data.checkpoints)
    expect(result.valid).toBe(false)
    expect(result.brokenAt).toBe(events[4]?.id)
    expect(result.verifiedCount).toBe(4)
    expect(result.checkpoints.every((checkpoint) => checkpoint.status === 'failed')).toBe(true)
  })

  it('detects a replaced digest', () => {
    const data = createSeedData()
    const events = structuredClone(data.auditEvents)
    events[2] = { ...events[2], hash: eventDigest('elsewhere', events[2]) }
    expect(verifyAuditChain(events).valid).toBe(false)
  })
})
