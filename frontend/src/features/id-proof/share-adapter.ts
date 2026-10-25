import { ocrMode, ocrProviderLabel } from '@/data/config'
import type {
  IdProofFieldKey,
  PolicyEvaluation,
  SharePreview,
  SharePreviewField,
  TaskClassification,
} from './types'
import { FIELD_LABELS, type IdProofHeuristic } from './heuristics'
import { assuranceLabel } from './policy-engine'
import { IdProofFailure } from './errors'

export const SHARE_RETENTION_NOTE =
  ocrMode === 'external'
    ? `DVault does not save the document. OCR is performed by ${ocrProviderLabel}; its data-retention terms apply. The shared message follows this conversation’s retention rules.`
    : 'The document is processed in this session only and is not saved by DVault. The shared message follows this conversation’s retention rules.'

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function createShareReference(): string {
  const bytes = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  const token = Array.from(bytes, (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join('')
  return `IDP-${token}`
}

export function formatFieldValue(key: IdProofFieldKey, value: string): string {
  if (key === 'age_over_18') {
    if (value === 'Yes') return '18 or older'
    if (value === 'No') return 'Under 18'
    return value
  }
  if (key === 'name_match') {
    if (value === 'Match') return 'Name matches the account profile'
    if (value === 'Partial match') return 'Name partially matches the account profile'
    if (value === 'No match') return 'Name does not match the account profile'
    return value
  }
  return value
}

export function fieldLabel(key: IdProofFieldKey, masked: boolean): string {
  const base = FIELD_LABELS[key]
  if (!masked || /\(masked\)/i.test(base)) return base
  return `${base} (masked)`
}

export interface SharePreviewInput {
  classification: TaskClassification
  heuristic: IdProofHeuristic
  evaluation: PolicyEvaluation
  recipient: { code: string; name: string }
  reference?: string
}

export function createSharePreview(input: SharePreviewInput): SharePreview {
  const fields: SharePreviewField[] = input.evaluation.allowedFields.map((field) => ({
    key: field.key,
    label: fieldLabel(field.key, field.masked),
    value: formatFieldValue(field.key, field.value),
    masked: field.masked,
  }))
  return {
    taskId: input.heuristic.taskId,
    taskLabel: input.heuristic.label,
    recipientName: input.recipient.name,
    recipientCode: input.recipient.code,
    purpose: input.heuristic.purposeLabel,
    fields,
    excluded: input.evaluation.excludedFieldLabels,
    assurance: input.evaluation.assurance,
    outcome: input.evaluation.outcome,
    documentRequired: input.evaluation.outcome === 'REQUEST_ID_DOCUMENT',
    documentTransmitted: false,
    retentionNote: SHARE_RETENTION_NOTE,
    reference: input.reference ?? createShareReference(),
  }
}

export function buildShareMessage(preview: SharePreview): string {
  const isVerificationResult = preview.outcome === 'RETURN_VERIFICATION_RESULT'
  const resultFields = preview.fields.filter((field) => field.key !== 'verification_receipt')
  const receipt = preview.fields.find((field) => field.key === 'verification_receipt')
  const lines = [
    `[DVault ID proof] ${preview.taskLabel}`,
    ...(isVerificationResult ? resultFields.map((field) => `Result: ${field.value}`) : []),
    ...(receipt ? [`Prior verification: ${receipt.value}`] : []),
    ...(preview.assurance === 'authoritative'
      ? ['Assurance: independently verified (synthetic receipt)']
      : [`Assurance: ${assuranceLabel(preview.assurance)}`]),
    `Purpose: ${preview.purpose}`,
  ]

  if (isVerificationResult) {
    lines.push('Shared fields: none')
  } else if (preview.fields.length) {
    lines.push(
      'Shared fields:',
      ...preview.fields.map((field) => `• ${field.label}: ${field.value}`),
    )
  } else {
    lines.push('Shared fields: none')
  }

  lines.push(`Recipient: ${preview.recipientName} (${preview.recipientCode})`)
  lines.push(`Reference: ${preview.reference}`)

  if (preview.documentRequired) {
    lines.push(
      'Document: original not transmitted by DVault. The recipient must complete its authorised verification step.',
    )
  }
  lines.push(`Retention: ${preview.retentionNote}`)
  return lines.join('\n')
}

export function containsRawIdentifier(value: string): boolean {
  if (/\b\d{4}\s?\d{4}\s?\d{4}\b/.test(value)) return true
  for (const match of value.matchAll(/\b([A-Z]{5})(\d{4})([A-Z])\b/g)) {
    if (match[1] !== 'XXXXX') return true
  }
  return false
}

export async function shareApprovedPreview(input: {
  preview: SharePreview
  send: (body: string) => Promise<boolean>
}): Promise<string> {
  if (input.preview.outcome === 'ASK_USER') {
    throw new IdProofFailure(
      'SHARE_FAILED',
      'DVault cannot share this request because the policy requires clarification or additional authorisation.',
    )
  }
  const message = buildShareMessage(input.preview)
  if (containsRawIdentifier(message)) {
    throw new IdProofFailure(
      'SHARE_FAILED',
      'DVault blocked the share because the payload failed a privacy check.',
    )
  }
  let sent = false
  try {
    sent = await input.send(message)
  } catch {
    throw new IdProofFailure(
      'SHARE_FAILED',
      'The approved information could not be shared. Nothing was sent.',
    )
  }
  if (!sent) {
    throw new IdProofFailure(
      'SHARE_FAILED',
      'The approved information could not be shared. Nothing was sent.',
    )
  }
  return message
}
