import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteOcrEngine, UnavailableOcrEngine } from './ocr-engine'

const FILE = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'id.jpg', {
  type: 'image/jpeg',
})

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RemoteOcrEngine', () => {
  it('posts the document to the DVault OCR endpoint and maps the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        text: 'Name: Rowan Ellis',
        confidence: 0.95,
        words: [{ text: 'Rowan', confidence: 0.93 }],
        provider: 'google_vision',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const engine = new RemoteOcrEngine('http://api.test')
    const result = await engine.recognizeImage(FILE)

    expect(result).toEqual({
      text: 'Name: Rowan Ellis',
      confidence: 0.95,
      words: [{ text: 'Rowan', confidence: 0.93 }],
      method: 'external_ocr',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/api/v1/workspaces/default/demo/id-proof/ocr')
    expect(init.method).toBe('POST')
    expect(init.cache).toBe('no-store')
    expect(init.body).toBe(FILE)
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg')
  })

  it('maps a missing provider configuration to OCR_UNAVAILABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'OCR_PROVIDER_NOT_CONFIGURED',
              message: 'External OCR is not configured on this server.',
            },
          },
          503,
        ),
      ),
    )
    const engine = new RemoteOcrEngine('http://api.test')
    await expect(engine.recognizeImage(FILE)).rejects.toMatchObject({
      code: 'OCR_UNAVAILABLE',
      message: 'External OCR is not configured on this server.',
    })
  })

  it('maps unsafe PDFs and provider failures to the right safe errors', async () => {
    const engine = new RemoteOcrEngine('http://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: 'UNSAFE_PDF', message: 'Active content.' } }, 422),
      ),
    )
    await expect(engine.recognizePdf(FILE)).rejects.toMatchObject({ code: 'UNSAFE_PDF' })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: 'OCR_PROVIDER_ERROR', message: 'Provider failed.' } }, 502),
      ),
    )
    await expect(engine.recognizeImage(FILE)).rejects.toMatchObject({ code: 'OCR_FAILED' })
  })

  it('reports an unreachable service without leaking the document', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const engine = new RemoteOcrEngine('http://api.test')
    await expect(engine.recognizeImage(FILE)).rejects.toMatchObject({
      code: 'OCR_UNAVAILABLE',
    })
  })

  it('honours cancellation before any request is made', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()
    const engine = new RemoteOcrEngine('http://api.test')
    await expect(
      engine.recognizeImage(FILE, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('UnavailableOcrEngine', () => {
  it('fails closed when external OCR has no API base', async () => {
    const engine = new UnavailableOcrEngine()
    await expect(engine.recognizeImage(FILE)).rejects.toMatchObject({
      code: 'OCR_UNAVAILABLE',
    })
    await expect(engine.recognizePdf(FILE)).rejects.toMatchObject({
      code: 'OCR_UNAVAILABLE',
    })
  })
})
