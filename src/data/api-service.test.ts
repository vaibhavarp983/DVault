import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSeedData } from './synthetic'
import { ApiError, HttpBusinessRepository } from './api-service'

const snapshot = createSeedData()

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
  it('loads the workspace snapshot from the configured base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)

    const repository = new HttpBusinessRepository('http://api.test/')
    const result = await repository.load()

    expect(result.documents).toHaveLength(28)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/business',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('sends review mutations to the FastAPI route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)

    const repository = new HttpBusinessRepository('http://api.test')
    await repository.markDocumentReviewed('doc-inv-1042')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/business/documents/doc-inv-1042/review',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reviewStatus: 'reviewed' }),
      }),
    )
  })

  it('uses the agreed mutation paths for jobs, campaigns and rights requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)

    const repository = new HttpBusinessRepository('http://api.test')
    await repository.retryJob('job-whatsapp')
    await repository.executeCampaign('cmp-autumn')
    await repository.retryRightsRequest('rr-2081')
    await repository.reset()

    const urls = fetchMock.mock.calls.map((call) => call[0])
    expect(urls).toEqual([
      'http://api.test/business/jobs/job-whatsapp/retry',
      'http://api.test/business/campaigns/cmp-autumn/execute',
      'http://api.test/business/rights-requests/rr-2081/retry',
      'http://api.test/business/reset',
    ])
  })

  it('surfaces FastAPI error details', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: 'Job is not retryable' }, 409))
    vi.stubGlobal('fetch', fetchMock)

    const repository = new HttpBusinessRepository('http://api.test')
    const error = await repository.retryJob('job-index').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).message).toBe('Job is not retryable')
  })

  it('reports an unreachable backend with an actionable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const repository = new HttpBusinessRepository('http://api.test')
    const error = await repository.load().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toContain('VITE_API_BASE_URL')
  })
})
