import type { RightsRequestType } from '@/domain/types'
import type { UserWorkspace } from '@/domain/user'

export interface UserRepository {
  load(): Promise<UserWorkspace>
  refresh(): Promise<UserWorkspace>
  setConsent(consentId: string, granted: boolean): Promise<UserWorkspace>
  createRequest(type: RightsRequestType): Promise<UserWorkspace>
  retryRequest(requestId: string): Promise<UserWorkspace>
  reset(): Promise<UserWorkspace>
}
