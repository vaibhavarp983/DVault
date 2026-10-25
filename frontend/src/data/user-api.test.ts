import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUserSeed } from './user-synthetic'
import { HttpUserRepository } from './user-api'

const snapshot = createUserSeed()
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

describe('HttpUserRepository', () => {
  it('loads the persisted personal workspace from the demo facade', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)
    const repository = new HttpUserRepository('http://api.test/')
    const result = await repository.load()

    expect(result.profile.name).toBe('Rowan Ellis')
    expect(fetchMock).toHaveBeenCalledWith(
      `${demo}/user`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('maps consent ids to the backend purpose', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)
    const repository = new HttpUserRepository('http://api.test')
    await repository.setConsent('ucns-marketing', true)

    expect(fetchMock).toHaveBeenCalledWith(
      `${demo}/user/consents/marketing`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ granted: true }),
      }),
    )
  })

  it('uses the demo request routes and sends rectification details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)
    const repository = new HttpUserRepository('http://api.test')

    await repository.createRequest('rectification', {
      field: 'email',
      requestedValue: 'new@example.test',
      reason: 'personal portal correction',
    })
    await repository.retryRequest('ureq-1046')
    await repository.reset()

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `${demo}/user/requests`,
      `${demo}/user/requests/ureq-1046/retry`,
      `${demo}/user/reset`,
    ])
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(options.body).toBe(
      JSON.stringify({
        type: 'rectification',
        correction: {
          field: 'email',
          requestedValue: 'new@example.test',
          reason: 'personal portal correction',
        },
      }),
    )
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
