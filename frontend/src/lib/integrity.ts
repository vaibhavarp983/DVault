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

export function simulatedHash(input: string): string {
  let digest = ''
  for (let index = 0; index < 8; index += 1) {
    digest += fnv1a(`${index}:${input}`).padStart(8, '0')
  }
  return digest
}

export const GENESIS_HASH = '0'.repeat(64)

export function simulatedMessageHash(input: {
  workspaceId: string
  conversationId: string
  messageId: string
  channel: string
  direction: string
  sender: string
  sentAt: string
  bodySha256: string
  subjectSha256: string
  previousHash: string
}): string {
  return simulatedHash(
    JSON.stringify({
      schema: 'dvault.message.v1',
      workspace_id: input.workspaceId,
      conversation_id: input.conversationId,
      message_id: input.messageId,
      channel: input.channel,
      direction: input.direction,
      sender: input.sender,
      sent_at: input.sentAt,
      body_sha256: input.bodySha256,
      subject_sha256: input.subjectSha256,
      previous_hash: input.previousHash,
    }),
  )
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
