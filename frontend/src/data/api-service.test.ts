import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSeedData } from './synthetic'
import { ApiError, HttpBusinessRepository } from './api-service'

const snapshot = createSeedData()
const demo = 'http://api.test/api/v1/workspaces/default/demo'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HttpBusinessRepository', () => {
  it('loads the persisted demo snapshot with the default masked contacts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)

    const repository = new HttpBusinessRepository('http://api.test/')
    const result = await repository.load()

    expect(result.documents).toHaveLength(28)
    expect(fetchMock).toHaveBeenCalledWith(
      `${demo}?contacts=masked`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('sends review mutations to the demo route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)

    const repository = new HttpBusinessRepository('http://api.test')
    await repository.markDocumentReviewed('doc-inv-1042')

    expect(fetchMock).toHaveBeenCalledWith(
      `${demo}/documents/doc-inv-1042/review?contacts=masked`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('uses the demo mutation paths for jobs, campaigns, rights and reset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)

    const repository = new HttpBusinessRepository('http://api.test')
    await repository.retryJob('job-whatsapp')
    await repository.previewCampaign('cmp-autumn')
    await repository.executeCampaign('cmp-autumn')
    await repository.retryRightsRequest('rr-2081')
    await repository.reset()

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `${demo}/jobs/job-whatsapp/retry?contacts=masked`,
      `${demo}/campaigns/cmp-autumn/preview?contacts=masked`,
      `${demo}/campaigns/cmp-autumn/execute?contacts=masked`,
      `${demo}/rights-requests/rr-2081/retry?contacts=masked`,
      `${demo}/reset?contacts=masked`,
    ])
  })

  it('switches the contact mode and sends a rectification payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)

    const repository = new HttpBusinessRepository('http://api.test')
    repository.setContactMode('synthetic')
    await repository.createRightsRequest({
      subjectRef: 'subref_demo',
      requestType: 'RECTIFICATION',
      correction: { field: 'email', requestedValue: 'new@example.test' },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `${demo}/rights-requests?contacts=synthetic`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          subjectRef: 'subref_demo',
          requestType: 'RECTIFICATION',
          correction: { field: 'email', requestedValue: 'new@example.test' },
        }),
      }),
    )
  })

  it('uploads a file as multipart form data without a JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)

    const repository = new HttpBusinessRepository('http://api.test')
    await repository.importFile('src-crm', new File(['a,b\n1,2'], 'demo.csv', { type: 'text/csv' }))

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${demo}/imports?contacts=masked`)
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect((options.body as FormData).get('source_id')).toBe('src-crm')
    expect((options.body as FormData).get('file')).toBeInstanceOf(File)
    expect(options.headers).not.toHaveProperty('Content-Type')
  })

  it('surfaces the backend error envelope with its code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: { code: 'JOB_NOT_RETRYABLE', message: 'Only rights jobs can be retried.' } },
        409,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const repository = new HttpBusinessRepository('http://api.test')
    const error = await repository.retryJob('job-index').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).code).toBe('JOB_NOT_RETRYABLE')
    expect((error as ApiError).message).toBe('Only rights jobs can be retried.')
  })

  it('still surfaces FastAPI validation detail arrays', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: [{ msg: 'field required' }] }, 422))
    vi.stubGlobal('fetch', fetchMock)

    const repository = new HttpBusinessRepository('http://api.test')
    const error = await repository.load().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('field required')
  })

  it('reports an unreachable backend with an actionable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const repository = new HttpBusinessRepository('http://api.test')
    const error = await repository.load().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toContain('VITE_API_BASE_URL')
  })
})
