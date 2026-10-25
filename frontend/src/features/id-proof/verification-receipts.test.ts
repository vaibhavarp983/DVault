import { beforeEach, describe, expect, it } from 'vitest'
import {
  getValidReceipt,
  issueVerificationReceipt,
  isVerificationUsable,
  listVerificationReceipts,
  resetVerificationReceipts,
} from './verification-receipts'

const NOW = new Date('2026-10-25T00:00:00.000Z')

beforeEach(() => {
  resetVerificationReceipts()
})

describe('verification receipts', () => {
  it('provides a valid synthetic in-person receipt for the demo recipient', () => {
    const receipt = getValidReceipt('usr-rowan', 'BIZ-ARANYA', 'identity_verification', NOW)
    expect(receipt?.method).toBe('in_person')
    expect(receipt?.synthetic).toBe(true)
    expect(receipt?.verifiedAt.startsWith('2026-08')).toBe(true)
  })

  it('does not return receipts for another recipient or after expiry', () => {
    expect(getValidReceipt('usr-rowan', 'BIZ-VER007', 'identity_verification', NOW)).toBeNull()
    const expired = new Date('2027-10-25T00:00:00.000Z')
    expect(getValidReceipt('usr-rowan', 'BIZ-ARANYA', 'identity_verification', expired)).toBeNull()
  })

  it('never treats an OCR-only receipt as usable', () => {
    const receipt = issueVerificationReceipt({
      subjectRef: 'usr-rowan',
      taskId: 'identity_verification',
      method: 'ocr',
      result: 'ocr_reading',
      issuedBy: 'BIZ-ARANYA',
      now: NOW,
    })
    expect(isVerificationUsable(receipt, NOW)).toBe(false)
    expect(listVerificationReceipts(NOW)).toHaveLength(2)
    expect(getValidReceipt('usr-rowan', 'BIZ-ARANYA', 'identity_verification', NOW)?.method).toBe(
      'in_person',
    )
  })

  it('resets session-issued receipts', () => {
    issueVerificationReceipt({
      subjectRef: 'usr-rowan',
      taskId: 'identity_verification',
      method: 'in_person',
      result: 'identity_confirmed',
      issuedBy: 'BIZ-VER007',
      now: NOW,
    })
    expect(listVerificationReceipts(NOW)).toHaveLength(2)
    resetVerificationReceipts()
    expect(listVerificationReceipts(NOW)).toHaveLength(1)
  })
})
