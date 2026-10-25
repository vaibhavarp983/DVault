import { describe, expect, it } from 'vitest'
import { getHeuristic, type IdProofHeuristic } from './heuristics'
import { evaluateIdProofPolicy } from './policy-engine'
import type {
  ExtractedField,
  IdProofFieldKey,
  IdProofTaskId,
  ProcessedDocument,
  TaskClassification,
} from './types'

const NOW = new Date('2026-10-25T00:00:00.000Z')

function classification(taskId: IdProofTaskId, confidence = 0.9): TaskClassification {
  return {
    taskId,
    confidence,
    matchedTriggers: ['test'],
    candidates: [{ taskId, confidence }],
    missingInformation: [],
    requiresClarification: false,
    noIdProofRequired: false,
    rationale: 'test',
  }
}

function field(
  key: IdProofFieldKey,
  value: string,
  confidence = 0.95,
  masked = false,
): ExtractedField {
  return { key, value, confidence, masked }
}

function document(
  fields: ExtractedField[],
  overrides: Partial<ProcessedDocument> = {},
): ProcessedDocument {
  return {
    documentType: 'aadhaar',
    method: 'image_ocr',
    assurance: 'ocr',
    fields,
    excludedFieldLabels: ['Aadhaar number', 'PAN number', 'Date of birth'],
    documentConfidence: fields.length
      ? Math.min(...fields.map((entry) => entry.confidence))
      : 0,
    warnings: [],
    ...overrides,
  }
}

function evaluate(
  taskId: IdProofTaskId,
  fields: ExtractedField[] | null,
  options: {
    recipientCode?: string
    confidence?: number
    heuristic?: IdProofHeuristic
    document?: ProcessedDocument | null
  } = {},
) {
  const heuristic = options.heuristic ?? getHeuristic(taskId)
  return evaluateIdProofPolicy({
    classification: classification(taskId, options.confidence ?? 0.9),
    heuristic,
    document:
      options.document === undefined
        ? fields === null
          ? null
          : document(fields)
        : options.document,
    recipient: {
      code: options.recipientCode ?? 'BIZ-ARANYA',
      name: 'Demo Business',
    },
    subjectRef: 'usr-rowan',
    now: NOW,
  })
}

describe('ID-proof policy engine', () => {
  it('returns only an age-eligibility result for age verification', () => {
    const evaluation = evaluate('age_verification', [field('age_over_18', 'Yes')])
    expect(evaluation.outcome).toBe('RETURN_VERIFICATION_RESULT')
    expect(evaluation.allowedFields.map((entry) => entry.key)).toEqual(['age_over_18'])
    expect(evaluation.assurance).toBe('ocr')
  })

  it('returns only a name match for name verification', () => {
    const evaluation = evaluate('name_verification', [field('name_match', 'Match')])
    expect(evaluation.outcome).toBe('RETURN_VERIFICATION_RESULT')
    expect(evaluation.allowedFields.map((entry) => entry.key)).toEqual(['name_match'])
  })

  it('shares only the permitted address fields', () => {
    const evaluation = evaluate(
      'address_verification',
      [
        field('address_line', '14 Lake Road'),
        field('city', 'Bengaluru'),
        field('postal_code', '560034'),
        field('address_verified', 'Verified from address proof'),
        field('full_name', 'Rowan Ellis'),
      ],
      { recipientCode: 'BIZ-VER007' },
    )
    expect(evaluation.outcome).toBe('SHARE_SELECTED_FIELDS')
    expect(evaluation.allowedFields.map((entry) => entry.key)).toEqual([
      'address_line',
      'city',
      'postal_code',
      'address_verified',
    ])
  })

  it('rejects an unauthorized recipient', () => {
    const evaluation = evaluate('age_verification', [field('age_over_18', 'Yes')], {
      recipientCode: 'BIZ-SWA001',
    })
    expect(evaluation.outcome).toBe('ASK_USER')
    expect(evaluation.recipientAuthorized).toBe(false)
    expect(evaluation.reasons).toContain('recipient_not_authorized')
  })

  it('strips a restricted field even if the OCR layer returns it', () => {
    const evaluation = evaluate('age_verification', [
      field('age_over_18', 'Yes'),
      field('aadhaar_masked', 'XXXX XXXX 9012', 0.95, true),
    ])
    expect(evaluation.outcome).toBe('RETURN_VERIFICATION_RESULT')
    expect(evaluation.allowedFields.map((entry) => entry.key)).toEqual(['age_over_18'])
    expect(evaluation.excludedFieldLabels).toContain('Aadhaar (masked)')
  })

  it('asks the user when a required field is not reliable', () => {
    const evaluation = evaluate('age_verification', [field('age_over_18', 'Yes', 0.4)])
    expect(evaluation.outcome).toBe('ASK_USER')
    expect(evaluation.reasons).toContain('low_field_confidence')
  })

  it('asks the user when a required field is missing', () => {
    const evaluation = evaluate('age_verification', [])
    expect(evaluation.outcome).toBe('ASK_USER')
    expect(evaluation.reasons).toContain('required_field_missing')
  })

  it('refuses an authoritative identity task without a verification service', () => {
    const evaluation = evaluate('identity_verification', null, {
      recipientCode: 'BIZ-LOT002',
    })
    expect(evaluation.outcome).toBe('ASK_USER')
    expect(evaluation.reasons).toContain('authoritative_verification_unavailable')
  })

  it('reuses a valid prior in-person receipt for re-verification', () => {
    const evaluation = evaluate('re_verification', null)
    expect(evaluation.outcome).toBe('RETURN_VERIFICATION_RESULT')
    expect(evaluation.assurance).toBe('authoritative')
    expect(evaluation.allowedFields.map((entry) => entry.key)).toEqual(['verification_receipt'])
  })

  it('does not reuse a receipt at a recipient that did not issue one', () => {
    const evaluation = evaluate('re_verification', null, { recipientCode: 'BIZ-VER007' })
    expect(evaluation.outcome).toBe('ASK_USER')
    expect(evaluation.reasons).toContain('authoritative_verification_unavailable')
  })

  it('requests a document only for an authorized document task', () => {
    const evaluation = evaluate('exam_hall_entry', [field('full_name', 'Rowan Ellis')])
    expect(evaluation.outcome).toBe('REQUEST_ID_DOCUMENT')
    expect(evaluation.allowedFields.map((entry) => entry.key)).toEqual(['full_name'])

    const hotel = evaluate('hotel_check_in', [field('full_name', 'Rowan Ellis')], {
      recipientCode: 'BIZ-ARANYA',
    })
    expect(hotel.outcome).toBe('ASK_USER')
    expect(hotel.reasons).toContain('recipient_not_authorized')
  })

  it('asks the user when classification confidence is low', () => {
    const evaluation = evaluate('age_verification', [field('age_over_18', 'Yes')], {
      confidence: 0.4,
    })
    expect(evaluation.outcome).toBe('ASK_USER')
    expect(evaluation.reasons).toContain('low_classification_confidence')
  })

  it('asks the user when the purpose is empty', () => {
    const heuristic = { ...getHeuristic('age_verification')!, purposeLabel: '' }
    const evaluation = evaluate('age_verification', [field('age_over_18', 'Yes')], { heuristic })
    expect(evaluation.outcome).toBe('ASK_USER')
    expect(evaluation.reasons).toContain('purpose_missing')
  })

  it('never lets a conversation expand the allowlist', () => {
    const evaluation = evaluate('name_verification', null, {
      document: document(
        [
          field('name_match', 'Match'),
          field('pan_masked', 'XXXXX1234F', 0.95, true),
        ],
        { excludedFieldLabels: ['PAN number'] },
      ),
    })
    expect(evaluation.outcome).toBe('RETURN_VERIFICATION_RESULT')
    expect(evaluation.allowedFields.map((entry) => entry.key)).toEqual(['name_match'])
    expect(evaluation.excludedFieldLabels).toContain('PAN (masked)')
  })
})
