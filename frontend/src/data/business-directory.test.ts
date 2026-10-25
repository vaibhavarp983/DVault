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
} from './business-directory'

describe('business directory', () => {
  it('ships ten placeholder businesses plus the Aranya account', () => {
    expect(BUSINESS_DIRECTORY).toHaveLength(10)
    expect(BUSINESS_ACCOUNTS).toHaveLength(11)
    expect(BUSINESS_ACCOUNTS[0]).toBe(ARANYA_BUSINESS)
  })

  it('normalizes and resolves codes case-insensitively', () => {
    expect(normalizeBizCode(' biz-001 ')).toBe('BIZ-001')
    expect(resolveBizCode('biz-001')?.name).toBe('Blue Tokai Coffee Roasters')
    expect(resolveBizCode('missing')).toBeNull()
    expect(resolveBizCode(null)).toBeNull()
  })

  it('falls back to Aranya when a conversation has no code', () => {
    expect(businessForConversation(undefined)?.code).toBe(ARANYA_BUSINESS.code)
    expect(businessForConversation('BIZ-010')?.name).toBe('SparkFit Studio')
    expect(businessForConversation(undefined, 'Custom Biz').name).toBe('Custom Biz')
  })

  it('provides a prefilled body for every mail type', () => {
    expect(BIZ_MESSAGE_TYPES).toHaveLength(5)
    for (const type of BIZ_MESSAGE_TYPES) {
      expect(BIZ_MESSAGE_TEMPLATES[type].subject.length).toBeGreaterThan(0)
      expect(BIZ_MESSAGE_TEMPLATES[type].body('Blue Tokai')).toContain('Blue Tokai')
    }
  })
})
