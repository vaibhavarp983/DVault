import { describe, expect, it } from 'vitest'
import {
  COMMON_BLOCKED_FIELDS,
  ID_PROOF_HEURISTICS,
  getHeuristic,
  recipientAuthorizedForTask,
} from './heuristics'

describe('ID-proof heuristics', () => {
  it('defines all 20 tasks with unique identifiers', () => {
    expect(ID_PROOF_HEURISTICS).toHaveLength(20)
    expect(new Set(ID_PROOF_HEURISTICS.map((rule) => rule.taskId)).size).toBe(20)
  })

  it('gives every rule a purpose, triggers, outputs and fallbacks', () => {
    for (const rule of ID_PROOF_HEURISTICS) {
      expect(rule.label.length).toBeGreaterThan(0)
      expect(rule.purposeLabel.length).toBeGreaterThan(0)
      expect(rule.triggers.length).toBeGreaterThan(0)
      expect(rule.requiredOutput).toMatch(/verification_result|fields|document/)
      expect(rule.verificationMethod).toMatch(/ocr|text_layer|authoritative|in_person/)
      expect(rule.onAmbiguousTask).toBe('ask_user')
      expect(rule.onLowOcrConfidence).toBe('ask_user')
      expect(rule.retentionPolicy).toMatch(/no_retention|ephemeral_processing_only/)
      expect(rule.userReviewRequired).toBe(true)
      expect(rule.recipientAuthorizationRequired).toBe(true)
    }
  })

  it('blocks raw identifiers, photographs, signatures and document copies by default', () => {
    for (const rule of ID_PROOF_HEURISTICS) {
      for (const blocked of COMMON_BLOCKED_FIELDS) {
        expect(rule.blockedByDefault).toContain(blocked)
      }
    }
  })

  it('keeps required and shared fields inside the allowlist', () => {
    for (const rule of ID_PROOF_HEURISTICS) {
      const allowed = new Set([...rule.allowedSourceFields, ...rule.derivedOutputs])
      for (const field of [...rule.requiredFields, ...rule.shareFields]) {
        expect(allowed.has(field)).toBe(true)
      }
    }
  })

  it('never allows a raw Aadhaar or PAN field in the allowlist', () => {
    for (const rule of ID_PROOF_HEURISTICS) {
      const allowed = new Set([...rule.allowedSourceFields, ...rule.derivedOutputs])
      expect(allowed.has('aadhaar_number')).toBe(false)
      expect(allowed.has('pan_number')).toBe(false)
      expect(allowed.has('document_copy')).toBe(false)
    }
  })

  it('authorizes only the declared demo recipients', () => {
    expect(recipientAuthorizedForTask('BIZ-ARANYA', 'age_verification')).toBe(true)
    expect(recipientAuthorizedForTask('BIZ-ARANYA', 'identity_verification')).toBe(false)
    expect(recipientAuthorizedForTask('BIZ-VER007', 'tenant_verification')).toBe(true)
    expect(recipientAuthorizedForTask('BIZ-NIR003', 'driving_or_vehicle_service')).toBe(true)
    expect(recipientAuthorizedForTask('BIZ-SWA001', 'age_verification')).toBe(false)
    expect(recipientAuthorizedForTask(null, 'age_verification')).toBe(false)
  })

  it('resolves each task by id', () => {
    expect(getHeuristic('tenant_verification')?.category).toBe('tenancy')
    expect(getHeuristic(null)).toBeNull()
  })
})
