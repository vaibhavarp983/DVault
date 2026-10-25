import type { IdProofError, IdProofErrorCode } from './types'

export class IdProofFailure extends Error {
  readonly code: IdProofErrorCode

  constructor(code: IdProofErrorCode, message: string) {
    super(message)
    this.name = 'IdProofFailure'
    this.code = code
  }

  toInfo(): IdProofError {
    return { code: this.code, message: this.message }
  }
}

export function safeErrorMessage(error: unknown): IdProofError {
  if (error instanceof IdProofFailure) {
    return { code: error.code, message: error.message }
  }
  return {
    code: 'OCR_FAILED',
    message: 'The document could not be processed on this device. Nothing was shared.',
  }
}
