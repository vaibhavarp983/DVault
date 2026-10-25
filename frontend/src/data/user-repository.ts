import type { RightsRequestType } from '@/domain/types'
import type { UserWorkspace } from '@/domain/user'
import type { CorrectionPayload } from './repository'

export interface UserRepository {
  load(): Promise<UserWorkspace>
  refresh(): Promise<UserWorkspace>
  setConsent(consentId: string, granted: boolean): Promise<UserWorkspace>
  createRequest(type: RightsRequestType, correction?: CorrectionPayload): Promise<UserWorkspace>
  retryRequest(requestId: string): Promise<UserWorkspace>
  reset(): Promise<UserWorkspace>
}
