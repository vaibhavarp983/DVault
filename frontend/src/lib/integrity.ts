import type { AuditEvent, IntegrityCheckpoint } from '@/domain/types'

/** FNV-1a over a UTF-16 code unit stream. Deterministic and dependency-free. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function eventDigest(prevHash: string, event: Omit<AuditEvent, 'hash'>): string {
  const canonical = [
    prevHash,
    event.id,
    event.at,
    event.actor,
    event.action,
    event.target,
    event.category,
    event.severity,
  ].join('|')
  return `${fnv1a(canonical)}${fnv1a(`${canonical}::seal`)}`
}

export interface IntegrityResult {
  valid: boolean
  verifiedCount: number
  brokenAt?: string
  head: string
  checkpoints: IntegrityCheckpoint[]
}

export function verifyAuditChain(
  events: AuditEvent[],
  checkpoints: IntegrityCheckpoint[] = [],
): IntegrityResult {
  let prevHash = 'genesis'
  let brokenAt: string | undefined

  for (const event of events) {
    if (event.prevHash !== prevHash) {
      brokenAt = event.id
      break
    }
    const digest = eventDigest(prevHash, event)
    if (digest !== event.hash) {
      brokenAt = event.id
      break
    }
    prevHash = event.hash
  }

  return {
    valid: brokenAt === undefined,
    verifiedCount: brokenAt
      ? events.findIndex((event) => event.id === brokenAt)
      : events.length,
    brokenAt,
    head: prevHash,
    checkpoints: checkpoints.map((checkpoint) => ({
      ...checkpoint,
      status: brokenAt ? 'failed' : checkpoint.status,
    })),
  }
}

export function sealAuditChain(
  events: Omit<AuditEvent, 'hash' | 'prevHash'>[],
): AuditEvent[] {
  let prevHash = 'genesis'
  return events.map((event) => {
    const hash = eventDigest(prevHash, { ...event, prevHash })
    const sealed: AuditEvent = { ...event, prevHash, hash }
    prevHash = hash
    return sealed
  })
}
