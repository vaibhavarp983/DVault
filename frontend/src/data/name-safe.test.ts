import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NAME_SAFE_STORAGE_KEY,
  aliasForConversation,
  getNameSafeSnapshot,
  setNameSafeEnabled,
  subscribeNameSafe,
} from './name-safe'

const conversation = (id: string, subjectRef = 'usr-rowan') => ({ id, subjectRef })

beforeEach(() => {
  localStorage.clear()
  setNameSafeEnabled(false)
})

describe('name safe aliases', () => {
  it('is disabled by default', () => {
    expect(getNameSafeSnapshot().enabled).toBe(false)
    expect(aliasForConversation(conversation('conv-a'))).toBeNull()
  })

  it('creates a stable alphanumeric code for each conversation', () => {
    setNameSafeEnabled(true, 'usr-rowan')

    const first = aliasForConversation(conversation('conv-a'))
    expect(first).toMatch(/^CST-[A-Z0-9]{4}$/)
    expect(aliasForConversation(conversation('conv-a'))).toBe(first)

    const second = aliasForConversation(conversation('conv-b'))
    expect(second).toMatch(/^CST-[A-Z0-9]{4}$/)
    expect(second).not.toBe(first)
  })

  it('only masks conversations belonging to the protected subject', () => {
    setNameSafeEnabled(true, 'usr-rowan')

    expect(aliasForConversation(conversation('conv-a'))).toMatch(/^CST-/)
    expect(aliasForConversation(conversation('conv-a', 'usr-other'))).toBeNull()
  })

  it('removes the alias and persisted state when disabled', () => {
    setNameSafeEnabled(true, 'usr-rowan')
    expect(localStorage.getItem(NAME_SAFE_STORAGE_KEY)).toContain('usr-rowan')

    setNameSafeEnabled(false)

    expect(getNameSafeSnapshot().enabled).toBe(false)
    expect(aliasForConversation(conversation('conv-a'))).toBeNull()
    expect(localStorage.getItem(NAME_SAFE_STORAGE_KEY)).toBeNull()
  })

  it('falls back to disabled when persisted state is malformed', () => {
    localStorage.setItem(NAME_SAFE_STORAGE_KEY, '{not-json')

    expect(getNameSafeSnapshot()).toEqual({
      enabled: false,
      subjectRef: null,
      salt: null,
    })
  })

  it('notifies subscribers when protection changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeNameSafe(listener)

    setNameSafeEnabled(true, 'usr-rowan')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setNameSafeEnabled(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
