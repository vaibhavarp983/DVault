import { describe, expect, it } from 'vitest'
import {
  unavailableAuthoritativeVerification,
  unavailableDocumentTransport,
} from './ports'

describe('integration ports', () => {
  it('fails closed when secure document transport is unavailable', async () => {
    expect(unavailableDocumentTransport.available).toBe(false)
    await expect(
      unavailableDocumentTransport.shareDocument({
        file: new File(['x'], 'id.png', { type: 'image/png' }),
        recipientCode: 'BIZ-ARANYA',
        reference: 'IDP-TEST01',
        expiresAt: '2026-10-26T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'SHARE_FAILED' })
  })

  it('reports authoritative verification as unavailable rather than guessing', async () => {
    expect(unavailableAuthoritativeVerification.available).toBe(false)
    await expect(
      unavailableAuthoritativeVerification.verify({
        subjectRef: 'usr-rowan',
        recipientCode: 'BIZ-LOT002',
        taskId: 'identity_verification',
      }),
    ).resolves.toEqual({ status: 'unavailable', method: 'authoritative' })
  })
})
