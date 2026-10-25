import type { RightsRequestType } from '@/domain/types'
import type { WithdrawalTierKey } from '@/domain/messaging'
import type { UserWorkspace } from '@/domain/user'
import type { CorrectionPayload } from './repository'

export interface UserRepository {
  load(): Promise<UserWorkspace>
  refresh(): Promise<UserWorkspace>
  setConsent(consentId: string, granted: boolean): Promise<UserWorkspace>
  createRequest(type: RightsRequestType, correction?: CorrectionPayload): Promise<UserWorkspace>
  retryRequest(requestId: string): Promise<UserWorkspace>
  reset(): Promise<UserWorkspace>
  sendMessage(conversationId: string, body: string): Promise<UserWorkspace>
  markConversationRead(conversationId: string): Promise<UserWorkspace>
  verifyConversation(conversationId: string): Promise<UserWorkspace>
  withdraw(tier: WithdrawalTierKey): Promise<UserWorkspace>
}
