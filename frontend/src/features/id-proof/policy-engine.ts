import type {
  Assurance,
  ExtractedField,
  IdProofFieldKey,
  PolicyEvaluation,
  ProcessedDocument,
  TaskClassification,
} from './types'
import { FIELD_LABELS, recipientAuthorizedForTask, type IdProofHeuristic } from './heuristics'
import { MIN_FIELD_CONFIDENCE } from './document-processor'
import { getValidReceipt } from './verification-receipts'

export const POLICY_CONFIDENCE_THRESHOLD = 0.6

export interface PolicyRecipient {
  code: string
  name: string
}

export interface PolicyInput {
  classification: TaskClassification
  heuristic: IdProofHeuristic | null
  document: ProcessedDocument | null
  recipient: PolicyRecipient | null
  subjectRef: string
  now?: Date
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function askUser(
  reasons: string[],
  userMessage: string,
  input: PolicyInput,
  recipientAuthorized: boolean,
): PolicyEvaluation {
  return {
    outcome: 'ASK_USER',
    allowedFields: [],
    excludedFieldLabels: input.document?.excludedFieldLabels ?? [],
    assurance: input.document?.assurance ?? 'none',
    recipientAuthorized,
    reasons,
    userMessage,
    requiresApproval: true,
  }
}

function reliable(field: ExtractedField | undefined): field is ExtractedField {
  return Boolean(field && field.confidence >= MIN_FIELD_CONFIDENCE)
}

function shareable(
  fields: Map<IdProofFieldKey, ExtractedField>,
  heuristic: IdProofHeuristic,
): ExtractedField[] {
  return heuristic.shareFields
    .map((key) => fields.get(key))
    .filter((field): field is ExtractedField => Boolean(field && reliable(field)))
}

function excludedLabelsFor(
  document: ProcessedDocument | null,
  fields: Map<IdProofFieldKey, ExtractedField>,
  shareFields: ExtractedField[],
  extra: string[] = [],
): string[] {
  const shared = new Set(shareFields.map((field) => field.key))
  const excluded = new Set([...(document?.excludedFieldLabels ?? []), ...extra])
  for (const field of fields.values()) {
    if (!shared.has(field.key)) excluded.add(FIELD_LABELS[field.key])
  }
  return [...excluded].sort()
}

export function evaluateIdProofPolicy(input: PolicyInput): PolicyEvaluation {
  const { classification, heuristic, document, recipient } = input
  const recipientAuthorized = recipientAuthorizedForTask(recipient?.code, heuristic?.taskId ?? null)

  if (!heuristic) {
    return askUser(
      ['task_unresolved'],
      'DVault could not identify a specific identity task from this conversation. Choose the task you need before sharing anything.',
      input,
      recipientAuthorized,
    )
  }

  if (classification.confidence < POLICY_CONFIDENCE_THRESHOLD) {
    return askUser(
      ['low_classification_confidence'],
      'DVault is not confident which identity task this conversation needs. Confirm the task first.',
      input,
      recipientAuthorized,
    )
  }

  if (!recipient) {
    return askUser(
      ['recipient_missing'],
      'This conversation has no recognised business recipient. DVault will not share identity information.',
      input,
      false,
    )
  }

  if (!recipientAuthorized) {
    return askUser(
      ['recipient_not_authorized'],
      `${recipient.name} is not authorised to receive ${heuristic.label.toLowerCase()} information for this purpose.`,
      input,
      false,
    )
  }

  if (!heuristic.purposeLabel.trim()) {
    return askUser(
      ['purpose_missing'],
      'The purpose of this identity check is unclear. DVault will not share until it is clear.',
      input,
      true,
    )
  }

  const allowedKeys = new Set<IdProofFieldKey>([
    ...heuristic.allowedSourceFields,
    ...heuristic.derivedOutputs,
  ])
  const blocked = new Set<IdProofFieldKey>(heuristic.blockedByDefault)
  const fields = new Map<IdProofFieldKey, ExtractedField>()
  const removedForPolicy: string[] = []

  for (const field of document?.fields ?? []) {
    if (!allowedKeys.has(field.key) || blocked.has(field.key)) {
      removedForPolicy.push(FIELD_LABELS[field.key])
      continue
    }
    fields.set(field.key, field)
  }

  const receipt =
    heuristic.taskId === 'identity_verification' || heuristic.taskId === 're_verification'
      ? getValidReceipt(input.subjectRef, recipient.code, 'identity_verification', input.now)
      : null

  if (heuristic.requiredOutput === 'verification_result') {
    if (receipt) {
      const receiptField: ExtractedField = {
        key: 'verification_receipt',
        value: `Verified in person on ${formatDate(receipt.verifiedAt)}`,
        confidence: 1,
        masked: false,
      }
      return {
        outcome: 'RETURN_VERIFICATION_RESULT',
        allowedFields: [receiptField],
        excludedFieldLabels: excludedLabelsFor(document, fields, [receiptField], removedForPolicy),
        assurance: 'authoritative',
        recipientAuthorized: true,
        reasons: ['recipient_authorized', 'valid_authoritative_receipt', 'fields_minimised'],
        userMessage:
          'A valid prior in-person verification can be reused. No document or identity number will be shared.',
        requiresApproval: true,
      }
    }

    if (heuristic.verificationMethod === 'authoritative') {
      return askUser(
        ['authoritative_verification_unavailable'],
        'This task requires an authorised identity-verification service. DVault will not treat an OCR reading as identity proof.',
        input,
        true,
      )
    }

    const required = heuristic.requiredFields.filter((key) => !fields.has(key))
    if (required.length) {
      return askUser(
        ['required_field_missing'],
        `The document did not provide a reliable ${required
          .map((key) => FIELD_LABELS[key].toLowerCase())
          .join(' and ')}. Try a clearer document or a different proof.`,
        input,
        true,
      )
    }

    const resultFields = heuristic.shareFields
      .map((key) => fields.get(key))
      .filter((field): field is ExtractedField => Boolean(field))
    if (!resultFields.length) {
      return askUser(
        ['required_field_missing'],
        'The document did not provide the identity result this task needs. Nothing was shared.',
        input,
        true,
      )
    }

    const unreliable = resultFields.find((field) => !reliable(field))
    if (unreliable) {
      return askUser(
        ['low_field_confidence'],
        'The required information could not be read reliably. Try a clearer image; nothing was shared.',
        input,
        true,
      )
    }

    return {
      outcome: 'RETURN_VERIFICATION_RESULT',
      allowedFields: resultFields,
      excludedFieldLabels: excludedLabelsFor(document, fields, resultFields, removedForPolicy),
      assurance: document?.assurance ?? 'none',
      recipientAuthorized: true,
      reasons: ['recipient_authorized', 'minimum_verification_result', 'fields_minimised'],
      userMessage:
        document?.assurance === 'text_layer'
          ? 'Only a verification result will be shared. It comes from the PDF text layer and is not independently verified.'
          : 'Only a verification result will be shared. It is OCR-derived and not independently verified.',
      requiresApproval: true,
    }
  }

  if (heuristic.requiredOutput === 'document') {
    const required = heuristic.requiredFields.filter((key) => !fields.has(key))
    if (required.length) {
      return askUser(
        ['required_field_missing'],
        `The document did not provide ${required
          .map((key) => FIELD_LABELS[key].toLowerCase())
          .join(' and ')}. Try a clearer document.`,
        input,
        true,
      )
    }
    const previewFields = shareable(fields, heuristic)
    return {
      outcome: 'REQUEST_ID_DOCUMENT',
      allowedFields: previewFields,
      excludedFieldLabels: excludedLabelsFor(document, fields, previewFields, removedForPolicy),
      assurance: document?.assurance ?? 'none',
      recipientAuthorized: true,
      reasons: ['recipient_authorized', 'document_required_by_task', 'fields_minimised'],
      userMessage:
        'This task needs an original ID document. DVault will not transmit the raw document in this build; it will share a short-lived reference for the recipient’s authorised verification step.',
      requiresApproval: true,
    }
  }

  if (heuristic.verificationMethod === 'authoritative') {
    return askUser(
      ['authoritative_verification_unavailable'],
      'This task requires the recipient’s authorised verification workflow. DVault will not treat an OCR reading as KYC or identity proof.',
      input,
      true,
    )
  }

  const required = heuristic.requiredFields.filter((key) => !fields.has(key))
  if (required.length) {
    return askUser(
      ['required_field_missing'],
      `The document did not provide ${required
        .map((key) => FIELD_LABELS[key].toLowerCase())
        .join(' and ')}. Try a clearer document or a different proof.`,
      input,
      true,
    )
  }

  const unreliable = heuristic.requiredFields
    .map((key) => fields.get(key))
    .find((field) => !reliable(field))
  if (unreliable) {
    return askUser(
      ['low_field_confidence'],
      'A required field could not be read reliably. Try a clearer image; nothing was shared.',
      input,
      true,
    )
  }

  const previewFields = shareable(fields, heuristic)
  return {
    outcome: 'SHARE_SELECTED_FIELDS',
    allowedFields: previewFields,
    excludedFieldLabels: excludedLabelsFor(document, fields, previewFields, removedForPolicy),
    assurance: document?.assurance ?? 'none',
    recipientAuthorized: true,
    reasons: ['recipient_authorized', 'required_fields_only', 'fields_minimised'],
    userMessage:
      'Only the fields required for this task will be shared. Everything else stays on this device.',
    requiresApproval: true,
  }
}

export function assuranceLabel(assurance: Assurance): string {
  if (assurance === 'authoritative') return 'Independently verified (synthetic receipt)'
  if (assurance === 'text_layer') return 'PDF text layer — not independently verified'
  if (assurance === 'ocr') return 'OCR-derived — not independently verified'
  return 'Not verified'
}
