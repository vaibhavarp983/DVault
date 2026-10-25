import type { RightsRequestType } from '@/domain/types'
import type { WithdrawalTierKey } from '@/domain/messaging'
import type { UserWorkspace } from '@/domain/user'
import { demoApiPrefix } from './config'
import { requestJson, type RequestOptions } from './http'
import type { CorrectionPayload } from './repository'
import type { UserRepository } from './user-repository'

export class HttpUserRepository implements UserRepository {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  private request(path: string, options: RequestOptions = {}): Promise<UserWorkspace> {
    return requestJson<UserWorkspace>(this.baseUrl, `${demoApiPrefix}${path}`, options)
  }

  load(): Promise<UserWorkspace> {
    return this.request('/user')
  }

  refresh(): Promise<UserWorkspace> {
    return this.request('/user/refresh', { method: 'POST' })
  }

  setConsent(consentId: string, granted: boolean): Promise<UserWorkspace> {
    const purpose = consentId.replace(/^ucns-/, '')
    return this.request(`/user/consents/${encodeURIComponent(purpose)}`, {
      method: 'POST',
      body: { granted },
    })
  }

  createRequest(type: RightsRequestType, correction?: CorrectionPayload): Promise<UserWorkspace> {
    return this.request('/user/requests', {
      method: 'POST',
      body: { type, correction },
    })
  }

  retryRequest(requestId: string): Promise<UserWorkspace> {
    return this.request(`/user/requests/${encodeURIComponent(requestId)}/retry`, {
      method: 'POST',
    })
  }

  reset(): Promise<UserWorkspace> {
    return this.request('/user/reset', { method: 'POST', timeoutMs: 60_000 })
  }

  sendMessage(conversationId: string, body: string): Promise<UserWorkspace> {
    return this.request(`/user/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: { body },
    })
  }

  markConversationRead(conversationId: string): Promise<UserWorkspace> {
    return this.request(`/user/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
    })
  }

  verifyConversation(conversationId: string): Promise<UserWorkspace> {
    return this.request(`/user/conversations/${encodeURIComponent(conversationId)}/verify`, {
      method: 'POST',
    })
  }

  withdraw(tier: WithdrawalTierKey): Promise<UserWorkspace> {
    return this.request('/user/withdraw', { method: 'POST', body: { tier } })
  }
}
