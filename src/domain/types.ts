export type ID = string
export type ISODate = string

export type Sensitivity = 'public' | 'internal' | 'confidential' | 'restricted'
export type ReviewStatus = 'auto' | 'needs-review' | 'reviewed'
export type ImportState = 'indexed' | 'importing' | 'queued' | 'failed' | 'missing'
export type SourceStatus = 'connected' | 'degraded' | 'disconnected'
export type SourceKind = 'drive' | 'crm' | 'billing' | 'messaging' | 'forms'

export interface Customer {
  id: ID
  name: string
  company: string
  email: string
  phone: string
  location: string
  segment: 'SMB' | 'Enterprise' | 'Consumer'
  since: ISODate
  status: 'active' | 'at-risk' | 'closed'
  owner: string
  sourceIds: ID[]
  synthetic: true
}

export interface DataSource {
  id: ID
  name: string
  kind: SourceKind
  provider: string
  status: SourceStatus
  lastSync: ISODate
  health: number
  note?: string
}

export type DocumentKind =
  | 'invoice'
  | 'purchase-order'
  | 'contract'
  | 'email'
  | 'form'
  | 'consent-record'
  | 'note'
  | 'conversation'
  | 'crm-record'
  | 'spreadsheet'

export type FieldCategory =
  | 'identity'
  | 'contact'
  | 'financial'
  | 'health'
  | 'consent'
  | 'operational'

export interface FieldClassification {
  field: string
  category: FieldCategory
  confidence: number
  note?: string
}

export interface SchemaField {
  field: string
  type: 'string' | 'email' | 'date' | 'currency' | 'number' | 'boolean' | 'enum'
  example: string
  classification: FieldCategory
}

export interface DocumentRecord {
  id: ID
  name: string
  kind: DocumentKind
  sourceId: ID
  customerId?: ID
  sizeKb: number
  modifiedAt: ISODate
  createdAt: ISODate
  importState: ImportState
  sensitivity: Sensitivity
  reviewStatus: ReviewStatus
  confidence: number
  tags: string[]
  snippet: string
  fields: FieldClassification[]
  schema: SchemaField[]
  missing?: string[]
  collection?: string
}

export type PolicyOutcome = 'allow' | 'deny' | 'review'

export interface PolicyDecision {
  id: ID
  policyName: string
  area: 'retention' | 'consent' | 'transfer' | 'sharing' | 'minimisation'
  outcome: PolicyOutcome
  subject: string
  customerId?: ID
  documentId?: ID
  decidedAt: ISODate
  explanation: string
  evidence: string[]
}

export type CampaignDecision = 'approve' | 'review' | 'block'
export type RecipientStatus = 'pending' | 'sent' | 'held'

export interface Campaign {
  id: ID
  name: string
  channel: 'email' | 'whatsapp'
  scheduledFor: ISODate
  status: 'draft' | 'ready' | 'running' | 'paused' | 'complete'
  message: string
}

export interface CampaignRecipient {
  id: ID
  campaignId: ID
  customerId: ID
  email: string
  decision: CampaignDecision
  reason: string
  status: RecipientStatus
}

export type RightsRequestType =
  | 'access'
  | 'erasure'
  | 'portability'
  | 'rectification'
  | 'objection'

export type SourceProgressStatus = 'pending' | 'complete' | 'failed' | 'not-applicable'

export interface RightsSourceProgress {
  sourceId: ID
  status: SourceProgressStatus
  detail?: string
}

export interface RightsRequest {
  id: ID
  reference: string
  customerId: ID
  type: RightsRequestType
  receivedAt: ISODate
  dueAt: ISODate
  status: 'open' | 'in-progress' | 'partial' | 'complete' | 'failed'
  sourceProgress: RightsSourceProgress[]
  notes: string
}

export type JobStatus = 'queued' | 'running' | 'retrying' | 'completed' | 'failed'

export interface JobTimelineEntry {
  at: ISODate
  label: string
  tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface Job {
  id: ID
  name: string
  kind: 'sync' | 'index' | 'export' | 'checkpoint' | 'evaluate'
  status: JobStatus
  progress: number
  startedAt: ISODate
  finishedAt?: ISODate
  attempts: number
  maxAttempts: number
  failureSummary?: string
  timeline: JobTimelineEntry[]
}

export type AuditCategory = 'access' | 'policy' | 'integrity' | 'rights' | 'system'

export interface AuditEvent {
  id: ID
  at: ISODate
  actor: string
  action: string
  target: string
  category: AuditCategory
  severity: 'info' | 'warning' | 'critical'
  hash: string
  prevHash: string
}

export interface IntegrityCheckpoint {
  id: ID
  at: ISODate
  eventsCovered: number
  hash: string
  status: 'verified' | 'pending' | 'failed'
}

export interface DemoData {
  seededAt: ISODate
  notice: string
  customers: Customer[]
  sources: DataSource[]
  documents: DocumentRecord[]
  policies: PolicyDecision[]
  campaigns: Campaign[]
  campaignRecipients: CampaignRecipient[]
  rightsRequests: RightsRequest[]
  jobs: Job[]
  auditEvents: AuditEvent[]
  checkpoints: IntegrityCheckpoint[]
}

export type NotificationTone = 'info' | 'success' | 'warning' | 'danger'

export interface AppNotification {
  id: ID
  title: string
  body: string
  at: ISODate
  tone: NotificationTone
  read: boolean
  appId?: 'vault' | 'file-explorer'
}
