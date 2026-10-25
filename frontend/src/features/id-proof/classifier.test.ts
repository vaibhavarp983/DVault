import { describe, expect, it } from 'vitest'
import { resolveBizCode } from '@/data/business-directory'
import type { BizMessageType } from '@/domain/messaging'
import { classifyTask } from './classifier'

const ARANYA = resolveBizCode('BIZ-ARANYA')!
const SWAAD = resolveBizCode('BIZ-SWA001')!
const LEGAL = resolveBizCode('BIZ-VER007')!

function classify(
  text: string,
  options: {
    business?: typeof ARANYA | null
    messageType?: BizMessageType
    draft?: string
    profileName?: string
  } = {},
) {
  const business = options.business === undefined ? ARANYA : options.business
  return classifyTask({
    messages: [{ sender: 'BUSINESS', body: text, sentAt: '2026-10-24T10:00:00.000Z' }],
    subject: '',
    draft: options.draft ?? '',
    messageType: options.messageType ?? 'GENERAL_ENQUIRY',
    business: business
      ? { code: business.code, name: business.name, category: business.category }
      : null,
    profileName: options.profileName ?? 'Rowan Ellis',
  })
}

describe('task classifier', () => {
  it('detects age verification', () => {
    const result = classify('Please verify that this customer is over 18.')
    expect(result.taskId).toBe('age_verification')
    expect(result.confidence).toBeGreaterThanOrEqual(0.6)
    expect(result.requiresClarification).toBe(false)
    expect(result.rationale).not.toMatch(/\d{4}\s?\d{4}\s?\d{4}/)
  })

  it('detects name verification', () => {
    const result = classify('Can you verify the name on this account?')
    expect(result.taskId).toBe('name_verification')
    expect(result.requiresClarification).toBe(false)
  })

  it('detects address verification', () => {
    const result = classify('We need proof of address from the utility bill.', {
      business: LEGAL,
    })
    expect(result.taskId).toBe('address_verification')
    expect(result.requiresClarification).toBe(false)
  })

  it('detects tenant verification for a landlord conversation', () => {
    const result = classify('The landlord needs the tenant verification completed.', {
      business: LEGAL,
    })
    expect(result.taskId).toBe('tenant_verification')
  })

  it('detects exam-hall entry and driving tasks', () => {
    expect(classify('Bring the hall ticket for exam hall entry.').taskId).toBe('exam_hall_entry')
    expect(
      classify('We need the driving licence for the test drive.', {
        business: resolveBizCode('BIZ-NIR003')!,
      }).taskId,
    ).toBe('driving_or_vehicle_service')
  })

  it('reports that a quote or support conversation needs no ID proof', () => {
    const result = classify('Please share a quote for the course.', {
      messageType: 'QUOTE_REQUEST',
    })
    expect(result.taskId).toBeNull()
    expect(result.noIdProofRequired).toBe(true)
    expect(result.requiresClarification).toBe(true)
    expect(result.missingInformation).toContain('task')
  })

  it('asks for clarification when two tasks are close', () => {
    const result = classify('Please complete the age verification and identity verification.')
    expect(result.requiresClarification).toBe(true)
    expect(result.candidates.length).toBeGreaterThanOrEqual(2)
    expect(result.rationale).toMatch(/more than one/i)
  })

  it('asks for clarification when there is no context', () => {
    const result = classify('')
    expect(result.taskId).toBeNull()
    expect(result.requiresClarification).toBe(true)
    expect(result.missingInformation).toContain('task')
  })

  it('does not authorize a task simply because the classifier matched it', () => {
    const result = classify('Please verify identity.', { business: SWAAD })
    expect(result.taskId).toBe('identity_verification')
    expect(result.requiresClarification).toBe(false)
  })

  it('uses the draft as context without returning any document fields', () => {
    const result = classify('Hello, we need one more document.', {
      draft: 'My date of birth is 01/01/1990 and I need age verification.',
    })
    expect(result.taskId).toBe('age_verification')
    expect(JSON.stringify(result)).not.toContain('01/01/1990')
  })
})
