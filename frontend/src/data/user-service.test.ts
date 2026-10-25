import { describe, expect, it } from 'vitest'
import { LocalUserService } from './user-service'

const makeService = () => new LocalUserService({ latencyMs: 0 })

describe('personal data service', () => {
  it('loads an isolated snapshot', async () => {
    const service = makeService()
    const first = await service.load()
    first.profile.name = 'Changed'
    const second = await service.load()
    expect(second.profile.name).toBe('Rowan Ellis')
  })

  it('updates optional consent and appends activity', async () => {
    const service = makeService()
    const before = await service.load()
    const after = await service.setConsent('ucns-marketing', true)
    const consent = after.consents.find((entry) => entry.id === 'ucns-marketing')
    expect(consent?.granted).toBe(true)
    expect(after.activity.length).toBe(before.activity.length + 1)
    expect(after.activity[0]?.action).toContain('Marketing emails')
  })

  it('rejects withdrawal of a required consent', async () => {
    const service = makeService()
    await expect(service.setConsent('ucns-service', false)).rejects.toThrow(
      'required for the service',
    )
  })

  it('creates a request with the next reference and fresh steps', async () => {
    const service = makeService()
    const after = await service.createRequest('rectification')
    const created = after.requests[0]
    expect(created?.reference).toBe('U-1047')
    expect(created?.type).toBe('rectification')
    expect(created?.steps).toHaveLength(5)
    expect(created?.steps[0]?.status).toBe('complete')
    expect(created?.status).toBe('open')
  })

  it('reopens a failed request step on retry', async () => {
    const service = makeService()
    const after = await service.retryRequest('ureq-1046')
    const request = after.requests.find((entry) => entry.id === 'ureq-1046')!
    expect(request.status).toBe('in-progress')
    expect(request.steps.some((step) => step.status === 'failed')).toBe(false)
    expect(request.steps.some((step) => step.status === 'in-progress')).toBe(true)
  })

  it('restores the deterministic seed', async () => {
    const service = makeService()
    await service.setConsent('ucns-marketing', true)
    const reset = await service.reset()
    expect(reset.consents.find((entry) => entry.id === 'ucns-marketing')?.granted).toBe(false)
    expect(reset.requests).toHaveLength(3)
  })

  it('starts a business conversation and returns it in the personal snapshot', async () => {
    const service = makeService()
    await service.reset()
    const after = await service.createBizConversation({
      bizCode: 'BIZ-NIR003',
      channel: 'chat',
      messageType: 'SUPPORT',
      body: 'Can you service my car tomorrow?',
    })
    const thread = after.conversations?.find(
      (entry) => entry.businessCode === 'BIZ-NIR003' && entry.channel === 'chat',
    )
    expect(thread?.businessName).toBe('Nirmal Auto Works')
    expect(thread?.messages.at(-1)?.body).toBe('Can you service my car tomorrow?')
    expect(after.activity[0]?.action).toContain('Nirmal Auto Works')
  })
})
