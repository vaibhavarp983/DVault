import type { Conversation } from '@/domain/messaging'
import { simulatedHash } from '@/lib/integrity'
import { workspaceRef } from './config'

export const NAME_SAFE_STORAGE_KEY = `dvault-name-safe-v1:${workspaceRef}`

const CODE_PREFIX = 'CST-'
const CODE_LENGTH = 4
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export interface NameSafeState {
  enabled: boolean
  subjectRef: string | null
  salt: string | null
}

const DISABLED_STATE: NameSafeState = Object.freeze({
  enabled: false,
  subjectRef: null,
  salt: null,
})

type ConversationIdentity = Pick<Conversation, 'id' | 'subjectRef'>

let memoryRaw: string | null = null
let cachedRaw: string | null | undefined
let cachedState: NameSafeState = DISABLED_STATE
let forceMemoryStorage = false
let storageListenerAttached = false
const listeners = new Set<() => void>()

function storage(): Storage | null {
  if (forceMemoryStorage || typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    forceMemoryStorage = true
    return null
  }
}

function currentRaw(): string | null {
  const store = storage()
  if (!store) return memoryRaw
  try {
    return store.getItem(NAME_SAFE_STORAGE_KEY)
  } catch {
    forceMemoryStorage = true
    return memoryRaw
  }
}

function parseState(raw: string | null): NameSafeState {
  if (!raw) return DISABLED_STATE
  try {
    const value = JSON.parse(raw) as Partial<NameSafeState>
    if (
      value.enabled !== true ||
      typeof value.subjectRef !== 'string' ||
      !value.subjectRef ||
      typeof value.salt !== 'string' ||
      !value.salt
    ) {
      return DISABLED_STATE
    }
    return {
      enabled: true,
      subjectRef: value.subjectRef,
      salt: value.salt,
    }
  } catch {
    return DISABLED_STATE
  }
}

function emit(): void {
  for (const listener of Array.from(listeners)) listener()
}

function handleStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== NAME_SAFE_STORAGE_KEY) return
  emit()
}

function ensureStorageListener(): void {
  if (storageListenerAttached || typeof window === 'undefined') return
  window.addEventListener('storage', handleStorage)
  storageListenerAttached = true
}

function writeRaw(raw: string | null): void {
  memoryRaw = raw
  const store = storage()
  if (!store) return
  try {
    if (raw === null) store.removeItem(NAME_SAFE_STORAGE_KEY)
    else store.setItem(NAME_SAFE_STORAGE_KEY, raw)
  } catch {
    forceMemoryStorage = true
  }
}

function createSalt(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function getNameSafeSnapshot(): NameSafeState {
  const raw = currentRaw()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedState = parseState(raw)
  }
  return cachedState
}

export function subscribeNameSafe(listener: () => void): () => void {
  listeners.add(listener)
  ensureStorageListener()
  return () => {
    listeners.delete(listener)
  }
}

export function setNameSafeEnabled(
  enabled: boolean,
  subjectRef?: string | null,
): void {
  if (enabled && subjectRef) {
    const raw = JSON.stringify({
      enabled: true,
      subjectRef,
      salt: createSalt(),
    } satisfies NameSafeState)
    writeRaw(raw)
    cachedRaw = raw
    cachedState = parseState(raw)
  } else {
    writeRaw(null)
    cachedRaw = null
    cachedState = DISABLED_STATE
  }
  emit()
}

export function aliasForConversation(
  conversation: ConversationIdentity,
  state: NameSafeState = getNameSafeSnapshot(),
): string | null {
  if (!state.enabled || !state.salt || !state.subjectRef) return null
  if (conversation.subjectRef !== state.subjectRef) return null

  const digest = simulatedHash(`${state.salt}:${state.subjectRef}:${conversation.id}`)
  let value = Number.parseInt(digest.slice(0, 8), 16)
  let code = ''
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code = CODE_ALPHABET[value % CODE_ALPHABET.length] + code
    value = Math.floor(value / CODE_ALPHABET.length)
  }
  return `${CODE_PREFIX}${code}`
}
