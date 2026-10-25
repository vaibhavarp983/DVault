import type { IdProofTaskId } from './types'

export type VerificationReceiptMethod = 'in_person' | 'authoritative' | 'ocr'

export interface VerificationReceipt {
  id: string
  subjectRef: string
  taskId: IdProofTaskId
  method: VerificationReceiptMethod
  result: string
  verifiedAt: string
  expiresAt: string
  issuedBy: string
  synthetic: boolean
}

const DAY = 86_400_000

function isoOffset(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY).toISOString()
}

function seedReceipts(): VerificationReceipt[] {
  return [
    {
      id: 'vr-synthetic-identity',
      subjectRef: '*',
      taskId: 'identity_verification',
      method: 'in_person',
      result: 'identity_confirmed',
      verifiedAt: '2026-08-26T00:00:00.000Z',
      expiresAt: '2027-08-26T00:00:00.000Z',
      issuedBy: 'BIZ-ARANYA',
      synthetic: true,
    },
  ]
}

let issuedReceipts: VerificationReceipt[] = []

export function listVerificationReceipts(_now: Date = new Date()): VerificationReceipt[] {
  return [...seedReceipts(), ...issuedReceipts]
}

export function isVerificationUsable(receipt: VerificationReceipt, now: Date = new Date()): boolean {
  if (receipt.method === 'ocr') return false
  return new Date(receipt.expiresAt).getTime() > now.getTime()
}

export function getValidReceipt(
  subjectRef: string,
  recipientCode: string,
  taskId: IdProofTaskId,
  now: Date = new Date(),
): VerificationReceipt | null {
  return (
    listVerificationReceipts(now)
      .filter(
        (receipt) =>
          (receipt.subjectRef === subjectRef || receipt.subjectRef === '*') &&
          receipt.issuedBy === recipientCode &&
          receipt.taskId === taskId &&
          isVerificationUsable(receipt, now),
      )
      .sort((left, right) => right.verifiedAt.localeCompare(left.verifiedAt))[0] ?? null
  )
}

export function issueVerificationReceipt(input: {
  subjectRef: string
  taskId: IdProofTaskId
  method: VerificationReceiptMethod
  result: string
  issuedBy: string
  now?: Date
  validityDays?: number
}): VerificationReceipt {
  const now = input.now ?? new Date()
  const receipt: VerificationReceipt = {
    id: `vr-session-${issuedReceipts.length + 1}`,
    subjectRef: input.subjectRef,
    taskId: input.taskId,
    method: input.method,
    result: input.result,
    verifiedAt: now.toISOString(),
    expiresAt: isoOffset(now, input.validityDays ?? 365),
    issuedBy: input.issuedBy,
    synthetic: true,
  }
  issuedReceipts = [receipt, ...issuedReceipts].slice(0, 20)
  return receipt
}

export function resetVerificationReceipts(): void {
  issuedReceipts = []
}
