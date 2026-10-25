import type { RightsRequestType } from '@/domain/types'
import type { UserRightsRequest, UserWorkspace } from '@/domain/user'
import { apiBaseUrl } from './config'
import type { UserRepository } from './user-repository'
import { HttpUserRepository } from './user-api'
import { createUserSeed } from './user-synthetic'

export interface UserServiceOptions {
  latencyMs?: number
}

function clone(data: UserWorkspace): UserWorkspace {
  return structuredClone(data)
}

function nextRequestNumber(requests: UserRightsRequest[]): number {
  const highest = requests.reduce((max, request) => {
    const value = Number(request.reference.replace(/[^\d]/g, ''))
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 1046)
  return highest + 1
}

export class LocalUserService implements UserRepository {
  private data: UserWorkspace
  private latencyMs: number

  constructor(options: UserServiceOptions = {}) {
    this.data = createUserSeed()
    this.latencyMs = options.latencyMs ?? 320
  }

  private async settle(): Promise<UserWorkspace> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs))
    }
    return clone(this.data)
  }

  private appendActivity(
    action: string,
    category: 'consent' | 'request' | 'system',
    severity: 'info' | 'warning' | 'critical' = 'info',
  ) {
    const counter = this.data.activity.length + 1
    this.data.activity.unshift({
      id: `uact-live-${counter}`,
      at: new Date().toISOString(),
      action,
      actor: category === 'system' ? 'System' : this.data.profile.name,
      category,
      severity,
    })
  }

  async load(): Promise<UserWorkspace> {
    return this.settle()
  }

  async refresh(): Promise<UserWorkspace> {
    return this.settle()
  }

  async setConsent(consentId: string, granted: boolean): Promise<UserWorkspace> {
    const consent = this.data.consents.find((entry) => entry.id === consentId)
    if (!consent) throw new Error('This consent could not be found.')
    if (consent.required && !granted) {
      throw new Error('This consent is required for the service and cannot be withdrawn.')
    }
    consent.granted = granted
    consent.updatedAt = new Date().toISOString()
    consent.channel = 'Preference centre'
    this.appendActivity(
      `${consent.purpose} consent ${granted ? 'granted' : 'withdrawn'}`,
      'consent',
    )
    return this.settle()
  }

  async createRequest(type: RightsRequestType): Promise<UserWorkspace> {
    const number = nextRequestNumber(this.data.requests)
    const reference = `U-${number}`
    const submittedAt = new Date()
    const dueAt = new Date(submittedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    const stepSuffix = String(number)
    const request: UserRightsRequest = {
      id: `ureq-${number}`,
      reference,
      type,
      submittedAt: submittedAt.toISOString(),
      dueAt: dueAt.toISOString(),
      status: 'open',
      steps: [
        { id: `step-submitted-${stepSuffix}`, label: 'Submitted', status: 'complete' },
        { id: `step-identity-${stepSuffix}`, label: 'Identity verified', status: 'pending' },
        { id: `step-collect-${stepSuffix}`, label: 'Sources collected', status: 'pending' },
        { id: `step-review-${stepSuffix}`, label: 'Review', status: 'pending' },
        { id: `step-response-${stepSuffix}`, label: 'Response delivered', status: 'pending' },
      ],
    }
    this.data.requests.unshift(request)
    this.appendActivity(`${type[0]?.toUpperCase()}${type.slice(1)} request ${reference} submitted`, 'request')
    return this.settle()
  }

  async retryRequest(requestId: string): Promise<UserWorkspace> {
    const request = this.data.requests.find((entry) => entry.id === requestId)
    if (request) {
      const failed = request.steps.find((step) => step.status === 'failed')
      if (failed) {
        failed.status = 'in-progress'
        failed.detail = 'Retry queued. Waiting for the source to respond.'
        request.status = 'in-progress'
        this.appendActivity(`Retry queued for ${request.reference}`, 'request', 'warning')
      }
    }
    return this.settle()
  }

  async reset(): Promise<UserWorkspace> {
    this.data = createUserSeed()
    return this.settle()
  }
}

export const userDataMode = apiBaseUrl ? 'api' : 'local'
export const userRepository: UserRepository = apiBaseUrl
  ? new HttpUserRepository(apiBaseUrl)
  : new LocalUserService()
