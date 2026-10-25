import type { BadgeTone } from '@/components/ui/badge'
import type {
  ConsentPurpose,
  UserActivityCategory,
  UserDocumentKind,
  UserRequestStatus,
  UserRightsRequest,
  UserSensitivity,
  UserSourceStatus,
  UserStepStatus,
} from '@/domain/user'

export const userRequestStatusTone: Record<UserRequestStatus, BadgeTone> = {
  open: 'info',
  'in-progress': 'gold',
  complete: 'success',
  failed: 'danger',
}

export const userRequestStatusLabel: Record<UserRequestStatus, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  complete: 'Complete',
  failed: 'Needs attention',
}

export const userStepTone: Record<UserStepStatus, BadgeTone> = {
  pending: 'neutral',
  'in-progress': 'gold',
  complete: 'success',
  failed: 'danger',
}

export const userSourceTone: Record<UserSourceStatus, BadgeTone> = {
  connected: 'success',
  degraded: 'warning',
  disconnected: 'danger',
}

export const userSensitivityTone: Record<UserSensitivity, BadgeTone> = {
  personal: 'neutral',
  confidential: 'warning',
  restricted: 'danger',
}

export const userDocumentKindLabel: Record<UserDocumentKind, string> = {
  account: 'Account record',
  invoice: 'Invoice',
  message: 'Message',
  consent: 'Consent record',
  form: 'Form',
  note: 'Note',
  export: 'Export',
}

export const userActivityTone: Record<UserActivityCategory, BadgeTone> = {
  consent: 'gold',
  access: 'info',
  request: 'warning',
  system: 'neutral',
}

export const userRequestTypeLabel: Record<UserRightsRequest['type'], string> = {
  access: 'Access',
  erasure: 'Erasure',
  portability: 'Portability',
  rectification: 'Rectification',
  objection: 'Objection',
}

export const consentStateLabel = (consent: ConsentPurpose) => {
  if (consent.required) return 'Required'
  return consent.granted ? 'Granted' : 'Withdrawn'
}
