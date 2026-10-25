import type { BizMessageType } from '@/domain/messaging'
import { ID_PROOF_HEURISTICS, recipientAuthorizedForTask } from './heuristics'
import type { IdProofConversationMessage, IdProofTaskId, TaskClassification } from './types'

export const CLASSIFIER_CONFIDENCE_THRESHOLD = 0.6
export const CLASSIFIER_AMBIGUITY_GAP = 0.12

const NO_ID_PROOF_MESSAGE_TYPES: BizMessageType[] = [
  'QUOTE_REQUEST',
  'PURCHASE_ORDER',
  'INVOICE',
  'SUPPORT',
]

export interface TaskClassifierInput {
  messages: IdProofConversationMessage[]
  subject: string
  draft: string
  messageType?: BizMessageType | null
  business: { code: string; name: string; category?: string } | null
  profileName: string
}

export interface TaskClassifier {
  classify(input: TaskClassifierInput): TaskClassification
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function classifyTask(input: TaskClassifierInput): TaskClassification {
  const haystack = normalizeText(
    [
      input.subject,
      input.draft,
      ...input.messages.slice(-40).map((message) => message.body ?? ''),
    ].join(' '),
  )
  const profile = normalizeText(input.profileName)

  const scored = ID_PROOF_HEURISTICS.map((heuristic) => {
    const matchedTriggers: string[] = []
    let score = 0
    for (const trigger of heuristic.triggers) {
      const needle = normalizeText(trigger)
      if (needle.length < 2) continue
      if (!haystack.includes(needle)) continue
      matchedTriggers.push(trigger)
      score += 1 + Math.min(needle.length, 30) / 30
    }
    if (score > 0) {
      if (recipientAuthorizedForTask(input.business?.code, heuristic.taskId)) {
        score += 0.12
      }
      if (
        heuristic.taskId === 'name_verification' &&
        profile.length > 0 &&
        haystack.includes(profile)
      ) {
        score += 0.08
      }
      score += heuristic.priority * 0.02
    }
    return {
      heuristic,
      matchedTriggers,
      confidence: round(clamp(score / 1.55, 0, 0.99)),
    }
  })
    .filter((entry) => entry.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence)

  const candidates = scored.slice(0, 4).map((entry) => ({
    taskId: entry.heuristic.taskId,
    confidence: entry.confidence,
  }))
  const top = scored[0]
  const second = scored[1]
  const ambiguous =
    Boolean(top && second) &&
    top!.confidence - second!.confidence < CLASSIFIER_AMBIGUITY_GAP &&
    second!.confidence >= 0.55
  const noMatch = !top
  const noIdProofRequired =
    noMatch && input.messageType ? NO_ID_PROOF_MESSAGE_TYPES.includes(input.messageType) : false
  const requiresClarification =
    noMatch || ambiguous || top!.confidence < CLASSIFIER_CONFIDENCE_THRESHOLD

  const missingInformation: string[] = []
  if (noMatch) missingInformation.push('task')
  if (ambiguous) missingInformation.push('task_confirmation')
  if (!input.business) missingInformation.push('recipient')
  if (top?.heuristic.taskId === 'name_verification' && !profile) {
    missingInformation.push('profile_name')
  }

  let rationale: string
  if (noMatch && noIdProofRequired) {
    rationale = 'This conversation looks like a quote, order, invoice or support request; no ID proof is needed.'
  } else if (noMatch) {
    rationale = 'No identity-task triggers were found in this conversation.'
  } else if (ambiguous) {
    rationale = `The conversation matches more than one identity task (${top!.heuristic.label} and ${second!.heuristic.label}).`
  } else {
    rationale = `Matched ${top!.matchedTriggers
      .slice(0, 3)
      .map((trigger) => `“${trigger}”`)
      .join(', ')} in the conversation.`
  }

  return {
    taskId: top?.heuristic.taskId ?? null,
    confidence: top?.confidence ?? 0,
    matchedTriggers: top?.matchedTriggers ?? [],
    candidates,
    missingInformation,
    requiresClarification,
    noIdProofRequired,
    rationale,
  }
}

export const taskClassifier: TaskClassifier = { classify: classifyTask }

export function taskLabel(taskId: IdProofTaskId): string {
  return ID_PROOF_HEURISTICS.find((heuristic) => heuristic.taskId === taskId)?.label ?? taskId
}
