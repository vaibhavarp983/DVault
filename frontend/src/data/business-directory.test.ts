import { describe, expect, it } from 'vitest'
import {
  ARANYA_BUSINESS,
  BIZ_MESSAGE_TEMPLATES,
  BIZ_MESSAGE_TYPES,
  BUSINESS_ACCOUNTS,
  BUSINESS_DIRECTORY,
  businessForConversation,
  normalizeBizCode,
  resolveBizCode,
  searchBusinesses,
} from './business-directory'

describe('business directory', () => {
  it('ships ten directory businesses plus the Aranya account', () => {
    expect(BUSINESS_DIRECTORY).toHaveLength(10)
    expect(BUSINESS_ACCOUNTS).toHaveLength(11)
    expect(BUSINESS_ACCOUNTS[0]).toBe(ARANYA_BUSINESS)
    expect(BUSINESS_DIRECTORY.every((business) => /^BIZ-[A-Z0-9]{6}$/.test(business.code))).toBe(
      true,
    )
  })

  it('normalizes and resolves codes case-insensitively', () => {
    expect(normalizeBizCode(' biz-swa001 ')).toBe('BIZ-SWA001')
    expect(resolveBizCode('biz-swa001')?.name).toBe('Swaad Kitchen')
    expect(resolveBizCode('missing')).toBeNull()
    expect(resolveBizCode(null)).toBeNull()
  })

  it('finds businesses by code, name and category', () => {
    expect(searchBusinesses('swaad')).toHaveLength(1)
    expect(searchBusinesses('BIZ-PIX009')[0]?.name).toBe('PixelCraft Studio')
    expect(searchBusinesses('healthcare').map((business) => business.name)).toEqual([
      'Lotus Bloom Clinic',
    ])
  })

  it('falls back to Aranya when a conversation has no code', () => {
    expect(businessForConversation(undefined)?.code).toBe(ARANYA_BUSINESS.code)
    expect(businessForConversation('BIZ-SIL010')?.name).toBe('Silver Screen Fitness')
    expect(businessForConversation(undefined, 'Custom Biz').name).toBe('Custom Biz')
  })

  it('provides a prefilled body for every mail type', () => {
    expect(BIZ_MESSAGE_TYPES).toHaveLength(5)
    for (const type of BIZ_MESSAGE_TYPES) {
      expect(BIZ_MESSAGE_TEMPLATES[type].subject.length).toBeGreaterThan(0)
      expect(BIZ_MESSAGE_TEMPLATES[type].body('Swaad Kitchen')).toContain('Swaad Kitchen')
    }
  })
})
