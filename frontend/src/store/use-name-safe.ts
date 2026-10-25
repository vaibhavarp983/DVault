import { useCallback, useSyncExternalStore } from 'react'
import {
  aliasForConversation,
  getNameSafeSnapshot,
  setNameSafeEnabled,
  subscribeNameSafe,
} from '@/data/name-safe'
import type { Conversation } from '@/domain/messaging'

type ConversationIdentity = Pick<Conversation, 'id' | 'subjectRef'>

export function useNameSafe() {
  const state = useSyncExternalStore(
    subscribeNameSafe,
    getNameSafeSnapshot,
    getNameSafeSnapshot,
  )

  const aliasFor = useCallback(
    (conversation: ConversationIdentity) => aliasForConversation(conversation, state),
    [state],
  )

  const setEnabled = useCallback(
    (enabled: boolean, subjectRef?: string | null) => {
      setNameSafeEnabled(enabled, subjectRef)
    },
    [],
  )

  return {
    enabled: state.enabled,
    subjectRef: state.subjectRef,
    aliasFor,
    setEnabled,
  }
}
