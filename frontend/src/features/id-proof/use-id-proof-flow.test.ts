import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveBizCode } from '@/data/business-directory'
import type { Conversation, ConversationMessage } from '@/domain/messaging'
import { useIdProofFlow } from './use-id-proof-flow'
import type { OcrEngine, OcrOutput } from './types'

const NOW = new Date('2026-10-25T00:00:00.000Z')
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])

const ID_TEXT = [
  'INCOME TAX DEPARTMENT',
  'PAN CARD',
  'Name: Rowan Ellis',
  'Date of Birth: 01/01/1990',
  'Address: 14 Lake Road, Koramangala, Bengaluru 560034',
  'Aadhaar: 1234 5678 9012',
  'PAN: ABCDE1234F',
].join('\n')

function imageFile(): File {
  return new File([JPEG_BYTES], 'id.jpg', { type: 'image/jpeg' })
}

function output(text: string, options: Partial<OcrOutput> = {}): OcrOutput {
  return { text, words: [], confidence: 0.95, method: 'image_ocr', ...options }
}

function engine(result: OcrOutput): OcrEngine {
  return {
    recognizeImage: async () => ({ ...result, words: [...result.words] }),
    recognizePdf: async () => ({ ...result, words: [...result.words] }),
  }
}

function message(body: string): ConversationMessage {
  return {
    id: 'm1',
    conversationId: 'conv-test',
    sequence: 1,
    direction: 'INBOUND',
    sender: 'BUSINESS',
    authorLabel: 'Aranya Coaching Centre',
    subject: 'Verification',
    body,
    bodySha256: 'hash',
    subjectSha256: 'hash',
    previousHash: 'hash',
    messageHash: 'hash',
    sentAt: '2026-10-24T10:00:00.000Z',
    retentionState: 'FULL',
    redactedAt: null,
    purgedAt: null,
    readByBusinessAt: null,
    readByCustomerAt: null,
    tamperState: 'VERIFIED',
  }
}

function conversation(body: string, businessCode = 'BIZ-ARANYA'): Conversation {
  return {
    id: 'conv-test',
    subjectRef: 'usr-rowan',
    customerName: 'Rowan Ellis',
    channel: 'chat',
    subject: 'Verification',
    status: 'OPEN',
    interactionLevel: 'HIGH',
    retentionClass: 'FULL',
    integrityState: 'VERIFIED',
    holdActive: false,
    unreadForBusiness: 0,
    unreadForCustomer: 0,
    messageCount: 1,
    lastActivityAt: '2026-10-24T10:00:00.000Z',
    createdAt: '2026-10-24T09:00:00.000Z',
    businessCode,
    businessName: 'Demo Business',
    messageType: 'GENERAL_ENQUIRY',
    messages: [message(body)],
  }
}

function hookOptions(body: string, options: {
  businessCode?: string
  result?: OcrOutput
  send?: (text: string) => Promise<boolean>
} = {}) {
  const businessCode = options.businessCode ?? 'BIZ-ARANYA'
  const send = (options.send ?? vi.fn().mockResolvedValue(true)) as ReturnType<typeof vi.fn>
  return {
    send,
    options: {
      conversation: conversation(body, businessCode),
      business: resolveBizCode(businessCode),
      profileName: 'Rowan Ellis',
      subjectRef: 'usr-rowan',
      draft: '',
      send,
      engine: engine(options.result ?? output(ID_TEXT)),
      now: () => NOW,
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ID-proof flow', () => {
  it('goes from a business message to an approved age-verification share', async () => {
    const { options, send } = hookOptions('Please verify that this customer is over 18.')
    const { result } = renderHook(() => useIdProofFlow(options))

    act(() => result.current.begin())
    expect(result.current.state.step).toBe('menu')

    act(() => result.current.chooseFile(imageFile(), 'image'))
    expect(result.current.state.step).toBe('notice')

    await act(async () => {
      await result.current.confirmProcessing()
    })
    expect(result.current.state.step).toBe('preview')
    expect(result.current.state.preview?.fields.map((field) => field.key)).toEqual(['age_over_18'])

    await act(async () => {
      await result.current.approve()
    })
    expect(send).toHaveBeenCalledTimes(1)
    const sent = send.mock.calls[0]?.[0] ?? ''
    expect(sent).toContain('[DVault ID proof] Age verification')
    expect(sent).toContain('Result: 18 or older')
    expect(sent).not.toMatch(/\b\d{4}\s?\d{4}\s?\d{4}\b/)
    expect(sent).not.toMatch(/\b[A-Z]{5}\d{4}[A-Z]\b/)
    expect(result.current.state.step).toBe('done')
    expect(result.current.state.preview).toBeNull()
    expect(result.current.state.document).toBeNull()
  })

  it('cancels from the preview without sending anything', async () => {
    const { options, send } = hookOptions('Please verify that this customer is over 18.')
    const { result } = renderHook(() => useIdProofFlow(options))
    act(() => result.current.begin())
    act(() => result.current.chooseFile(imageFile(), 'image'))
    await act(async () => {
      await result.current.confirmProcessing()
    })
    expect(result.current.state.step).toBe('preview')

    act(() => result.current.cancel())
    expect(send).not.toHaveBeenCalled()
    expect(result.current.state.open).toBe(false)
    expect(result.current.state.preview).toBeNull()
  })

  it('asks for clarification when the conversation is ambiguous', async () => {
    const { options, send } = hookOptions(
      'Please complete the age verification and identity verification.',
    )
    const { result } = renderHook(() => useIdProofFlow(options))
    act(() => result.current.begin())
    act(() => result.current.chooseFile(imageFile(), 'image'))
    await act(async () => {
      await result.current.confirmProcessing()
    })
    expect(result.current.state.step).toBe('clarify')
    expect(result.current.state.classification?.requiresClarification).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses an unauthorized recipient without reading the document', async () => {
    const { options, send } = hookOptions('Please verify age.', { businessCode: 'BIZ-SWA001' })
    const recognize = vi.fn()
    options.engine = { recognizeImage: recognize, recognizePdf: recognize }
    const { result } = renderHook(() => useIdProofFlow(options))
    act(() => result.current.begin())
    act(() => result.current.chooseFile(imageFile(), 'image'))
    await act(async () => {
      await result.current.confirmProcessing()
    })
    expect(result.current.state.step).toBe('issue')
    expect(result.current.state.evaluation?.reasons).toContain('recipient_not_authorized')
    expect(recognize).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('asks for a clearer document when OCR confidence is low', async () => {
    const { options, send } = hookOptions('Please verify that this customer is over 18.', {
      result: output(ID_TEXT, { confidence: 0.3, words: [{ text: '1990', confidence: 0.3 }] }),
    })
    const { result } = renderHook(() => useIdProofFlow(options))
    act(() => result.current.begin())
    act(() => result.current.chooseFile(imageFile(), 'image'))
    await act(async () => {
      await result.current.confirmProcessing()
    })
    expect(result.current.state.step).toBe('issue')
    expect(result.current.state.evaluation?.reasons).toContain('low_field_confidence')
    expect(send).not.toHaveBeenCalled()
  })

  it('reports a sharing failure and clears the preview', async () => {
    const { options } = hookOptions('Please verify that this customer is over 18.', {
      send: vi.fn().mockResolvedValue(false),
    })
    const { result } = renderHook(() => useIdProofFlow(options))
    act(() => result.current.begin())
    act(() => result.current.chooseFile(imageFile(), 'image'))
    await act(async () => {
      await result.current.confirmProcessing()
    })
    await act(async () => {
      await result.current.approve()
    })
    expect(result.current.state.step).toBe('error')
    expect(result.current.state.error?.code).toBe('SHARE_FAILED')
    expect(result.current.state.preview).toBeNull()
    expect(result.current.state.document).toBeNull()
  })

  it('resets the flow when the conversation changes', async () => {
    const { options } = hookOptions('Please verify that this customer is over 18.')
    const { result, rerender } = renderHook((props: { options: typeof options }) => useIdProofFlow(props.options), {
      initialProps: { options },
    })
    act(() => result.current.begin())
    expect(result.current.state.open).toBe(true)

    rerender({
      options: {
        ...options,
        conversation: { ...options.conversation!, id: 'other-conversation' },
      },
    })
    expect(result.current.state.open).toBe(false)
  })
})
