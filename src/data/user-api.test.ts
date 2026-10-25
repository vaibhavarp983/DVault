import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUserSeed } from './user-synthetic'
import { HttpUserRepository } from './user-api'

const snapshot = createUserSeed()

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

describe('HttpUserRepository', () => {
  it('loads the personal workspace from /user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)
    const repository = new HttpUserRepository('http://api.test/')
    const result = await repository.load()

    expect(result.profile.name).toBe('Rowan Ellis')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/user',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('sends consent updates to the consent route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)
    const repository = new HttpUserRepository('http://api.test')
    await repository.setConsent('ucns-marketing', true)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/user/consents/ucns-marketing',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ granted: true }),
      }),
    )
  })

  it('uses the agreed request routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)
    const repository = new HttpUserRepository('http://api.test')

    await repository.createRequest('access')
    await repository.retryRequest('ureq-1046')
    await repository.reset()

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'http://api.test/user/requests',
      'http://api.test/user/requests/ureq-1046/retry',
      'http://api.test/user/reset',
    ])
  })

  it('surfaces required-consent conflicts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: 'Required consent cannot be withdrawn.' }, 409))
    vi.stubGlobal('fetch', fetchMock)
    const repository = new HttpUserRepository('http://api.test')
    const error = await repository.setConsent('ucns-service', false).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ status: 409, message: 'Required consent cannot be withdrawn.' })
  })
})
