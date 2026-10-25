import { IdProofFailure } from './errors'
import type { IdProofTaskId } from './types'

export interface DocumentTransportRequest {
  file: File
  recipientCode: string
  reference: string
  expiresAt: string
  signal?: AbortSignal
}

export interface DocumentTransportPort {
  readonly available: boolean
  shareDocument(request: DocumentTransportRequest): Promise<{ token: string; expiresAt: string }>
}

/** Fail-closed stand-in until a server-side, recipient-scoped document endpoint exists. */
export const unavailableDocumentTransport: DocumentTransportPort = {
  available: false,
  async shareDocument() {
    throw new IdProofFailure(
      'SHARE_FAILED',
      'Secure document transfer is not available in this build. Nothing was uploaded.',
    )
  },
}

export interface AuthoritativeVerificationRequest {
  subjectRef: string
  recipientCode: string
  taskId: IdProofTaskId
}

export interface AuthoritativeVerificationResult {
  status: 'verified' | 'unavailable'
  method: 'authoritative'
  verifiedAt?: string
  expiresAt?: string
  receiptId?: string
}

export interface AuthoritativeVerificationPort {
  readonly available: boolean
  verify(request: AuthoritativeVerificationRequest): Promise<AuthoritativeVerificationResult>
}

/** Fail-closed stand-in until an authorised identity-verification service is integrated. */
export const unavailableAuthoritativeVerification: AuthoritativeVerificationPort = {
  available: false,
  async verify() {
    return { status: 'unavailable', method: 'authoritative' }
  },
}
