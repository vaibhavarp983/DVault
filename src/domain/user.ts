import type { FieldClassification, RightsRequestType } from './types'

export interface UserProfile {
  id: string
  name: string
  email: string
  phone: string
  location: string
  memberSince: string
  synthetic: true
}

export type UserSourceCategory = 'storage' | 'billing' | 'messaging' | 'crm' | 'forms'
export type UserSourceStatus = 'connected' | 'degraded' | 'disconnected'

export interface UserSource {
  id: string
  name: string
  provider: string
  category: UserSourceCategory
  status: UserSourceStatus
  lastSync: string
  recordCount: number
  purpose: string
}

export interface ConsentPurpose {
  id: string
  purpose: string
  description: string
  granted: boolean
  required: boolean
  updatedAt: string
  channel: string
  expiresAt?: string
}

export type UserDocumentKind =
  | 'account'
  | 'invoice'
  | 'message'
  | 'consent'
  | 'form'
  | 'note'
  | 'export'

export type UserSensitivity = 'personal' | 'confidential' | 'restricted'

export interface UserDocument {
  id: string
  name: string
  kind: UserDocumentKind
  sourceId: string
  updatedAt: string
  sizeKb: number
  sensitivity: UserSensitivity
  summary: string
  heldSince: string
  retention: string
  fields: FieldClassification[]
}

export type UserRequestStatus = 'open' | 'in-progress' | 'complete' | 'failed'
export type UserStepStatus = 'pending' | 'in-progress' | 'complete' | 'failed'

export interface UserRequestStep {
  id: string
  label: string
  status: UserStepStatus
  detail?: string
}

export interface UserRightsRequest {
  id: string
  reference: string
  type: RightsRequestType
  submittedAt: string
  dueAt: string
  status: UserRequestStatus
  steps: UserRequestStep[]
  resolution?: string
}

export type UserActivityCategory = 'consent' | 'access' | 'request' | 'system'

export interface UserActivityEvent {
  id: string
  at: string
  action: string
  actor: string
  category: UserActivityCategory
  severity: 'info' | 'warning' | 'critical'
}

export interface UserWorkspace {
  generatedAt: string
  notice: string
  profile: UserProfile
  sources: UserSource[]
  consents: ConsentPurpose[]
  documents: UserDocument[]
  requests: UserRightsRequest[]
  activity: UserActivityEvent[]
}
