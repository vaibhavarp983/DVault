import { describe, expect, it, vi } from 'vitest'
import { getHeuristic } from './heuristics'
import { createSharePreview, buildShareMessage, containsRawIdentifier, shareApprovedPreview } from './share-adapter'
import type {
  ExtractedField,
  IdProofFieldKey,
  IdProofOutcome,
  IdProofTaskId,
  PolicyEvaluation,
  SharePreview,
  TaskClassification,
} from './types'

function field(key: IdProofFieldKey, value: string, masked = false): ExtractedField {
  return { key, value, confidence: 0.95, masked }
}

function classification(taskId: IdProofTaskId): TaskClassification {
  return {
    taskId,
    confidence: 0.9,
    matchedTriggers: ['test'],
    candidates: [{ taskId, confidence: 0.9 }],
    missingInformation: [],
    requiresClarification: false,
    noIdProofRequired: false,
    rationale: 'test',
  }
}

function evaluation(
  _taskId: IdProofTaskId,
  fields: ExtractedField[],
  outcome: IdProofOutcome = 'RETURN_VERIFICATION_RESULT',
): PolicyEvaluation {
  return {
    outcome,
    allowedFields: fields,
    excludedFieldLabels: ['Aadhaar number', 'PAN number', 'Date of birth'],
    assurance: 'ocr',
    recipientAuthorized: true,
    reasons: ['test'],
    userMessage: 'test',
    requiresApproval: true,
  }
}

function preview(
  taskId: IdProofTaskId,
  fields: ExtractedField[],
  outcome: IdProofOutcome = 'RETURN_VERIFICATION_RESULT',
): SharePreview {
  const heuristic = getHeuristic(taskId)!
  return createSharePreview({
    classification: classification(taskId),
    heuristic,
    evaluation: evaluation(taskId, fields, outcome),
    recipient: { code: 'BIZ-ARANYA', name: 'Aranya Coaching Centre' },
    reference: 'IDP-ABC123',
  })
}

describe('share adapter', () => {
  it('builds a minimum age-verification message', () => {
    const message = buildShareMessage(
      preview('age_verification', [field('age_over_18', 'Yes')]),
    )
    expect(message).toContain('[DVault ID proof] Age verification')
    expect(message).toContain('Result: 18 or older')
    expect(message).toContain('Shared fields: none')
    expect(message).toContain('OCR-derived — not independently verified')
    expect(message).toContain('Reference: IDP-ABC123')
    expect(message).not.toMatch(/\b\d{4}\s?\d{4}\s?\d{4}\b/)
  })

  it('lists only the approved address fields', () => {
    const message = buildShareMessage(
      preview(
        'address_verification',
        [
          field('address_line', '14 Lake Road'),
          field('city', 'Bengaluru'),
          field('postal_code', '560034'),
          field('address_verified', 'Verified from address proof'),
        ],
        'SHARE_SELECTED_FIELDS',
      ),
    )
    expect(message).toContain('Address line: 14 Lake Road')
    expect(message).toContain('Postal code: 560034')
    expect(message).not.toContain('Date of birth')
    expect(message).not.toContain('Aadhaar')
  })

  it('marks masked fields and keeps the raw value out', () => {
    const message = buildShareMessage(
      preview(
        'bank_account_opening',
        [field('pan_masked', 'XXXXX1234F', true)],
        'SHARE_SELECTED_FIELDS',
      ),
    )
    expect(message).toContain('PAN (masked): XXXXX1234F')
    expect(message).not.toContain('ABCDE1234F')
  })

  it('states that an original document is not transmitted', () => {
    const message = buildShareMessage(
      preview('exam_hall_entry', [field('full_name', 'Rowan Ellis')], 'REQUEST_ID_DOCUMENT'),
    )
    expect(message).toContain('original not transmitted')
    expect(message).toContain('authorised verification step')
  })

  it('sends the approved message through the existing sender', async () => {
    const send = vi.fn().mockResolvedValue(true)
    const message = await shareApprovedPreview({
      preview: preview('age_verification', [field('age_over_18', 'Yes')]),
      send,
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(message)
    expect(message).toContain('Result: 18 or older')
  })

  it('reports a share failure without leaking values', async () => {
    const send = vi.fn().mockResolvedValue(false)
    await expect(
      shareApprovedPreview({
        preview: preview('age_verification', [field('age_over_18', 'Yes')]),
        send,
      }),
    ).rejects.toMatchObject({ code: 'SHARE_FAILED' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('refuses to share an ASK_USER preview', async () => {
    const send = vi.fn().mockResolvedValue(true)
    await expect(
      shareApprovedPreview({
        preview: preview('age_verification', [], 'ASK_USER'),
        send,
      }),
    ).rejects.toMatchObject({ code: 'SHARE_FAILED' })
    expect(send).not.toHaveBeenCalled()
  })

  it('blocks a payload that contains a raw identifier', async () => {
    const send = vi.fn().mockResolvedValue(true)
    const unsafe = preview(
      'identity_verification',
      [field('aadhaar_masked', '1234 5678 9012')],
      'SHARE_SELECTED_FIELDS',
    )
    await expect(shareApprovedPreview({ preview: unsafe, send })).rejects.toMatchObject({
      code: 'SHARE_FAILED',
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('detects raw Aadhaar and PAN patterns', () => {
    expect(containsRawIdentifier('number 1234 5678 9012')).toBe(true)
    expect(containsRawIdentifier('PAN ABCDE1234F')).toBe(true)
    expect(containsRawIdentifier('XXXX XXXX 9012')).toBe(false)
    expect(containsRawIdentifier('XXXXX1234F')).toBe(false)
  })
})
