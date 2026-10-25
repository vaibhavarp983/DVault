import type { UserWorkspace } from '@/domain/user'
import type { UserRepository } from './user-repository'
import { requestJson, type RequestOptions } from './http'

export class HttpUserRepository implements UserRepository {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  private request(path: string, options: RequestOptions = {}): Promise<UserWorkspace> {
    return requestJson<UserWorkspace>(this.baseUrl, path, options)
  }

  load(): Promise<UserWorkspace> {
    return this.request('/user')
  }

  refresh(): Promise<UserWorkspace> {
    return this.request('/user/refresh', { method: 'POST' })
  }

  setConsent(consentId: string, granted: boolean): Promise<UserWorkspace> {
    return this.request(`/user/consents/${encodeURIComponent(consentId)}`, {
      method: 'POST',
      body: { granted },
    })
  }

  createRequest(type: string): Promise<UserWorkspace> {
    return this.request('/user/requests', { method: 'POST', body: { type } })
  }

  retryRequest(requestId: string): Promise<UserWorkspace> {
    return this.request(`/user/requests/${encodeURIComponent(requestId)}/retry`, {
      method: 'POST',
    })
  }

  reset(): Promise<UserWorkspace> {
    return this.request('/user/reset', { method: 'POST' })
  }
}
