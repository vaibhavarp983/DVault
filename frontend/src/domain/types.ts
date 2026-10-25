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
  since: ISODate | null
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
  documentCount?: number
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
  | 'rights-request'
  | 'report'

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
  customerIds?: ID[]
  subjectCount?: number
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
  preview?: DocumentPreview
}

export type PreviewKind =
  | 'invoice'
  | 'purchase-order'
  | 'email-thread'
  | 'conversation'
  | 'consent-record'
  | 'table'
  | 'form'
  | 'note'
  | 'report'
  | 'rights-request'

export interface PreviewField {
  label: string
  value: string
  classification: FieldCategory
}

export interface PreviewLineItem {
  description: string
  quantity: number
  unit_price: number | null
  amount: number | null
}

export interface PreviewMessage {
  from?: string
  to?: string
  cc?: string
  subject?: string
  sent_at?: string
  sender?: string
  direction: 'inbound' | 'outbound'
  body: string
}

export interface PreviewColumn {
  key: string
  label: string
  type: string
  classification: FieldCategory
}

export interface DocumentPreview {
  kind: PreviewKind
  reference?: string | null
  status?: string | null
  fields?: PreviewField[]
  line_items?: PreviewLineItem[]
  totals?: Record<string, number>
  messages?: PreviewMessage[]
  columns?: PreviewColumn[]
  rows?: Record<string, string>[]
  row_count?: number
  truncated?: boolean
  consent?: Record<string, unknown>
  body?: string
  synthetic_contacts?: boolean
}

export type PolicyOutcome = 'allow' | 'deny' | 'review'

export interface PolicyDecision {
  id: ID
  policyName: string
  area: 'retention' | 'consent' | 'transfer' | 'sharing' | 'minimisation' | 'marketing'
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
  customerId?: ID
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

export type SourceProgressStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed'
  | 'restricted'
  | 'not-applicable'

export interface RightsSourceProgress {
  sourceId: ID
  status: SourceProgressStatus
  detail?: string
}

export interface RightsArtifact {
  id: ID
  kind: 'ACCESS_SUMMARY' | 'PORTABILITY_BUNDLE' | string
  status: string
  downloadUrl: string | null
}

export interface RightsRequest {
  id: ID
  reference: string
  customerId: ID
  type: RightsRequestType
  receivedAt: ISODate
  dueAt: ISODate
  status: 'open' | 'in-progress' | 'partial' | 'review' | 'complete' | 'failed'
  sourceProgress: RightsSourceProgress[]
  notes: string
  artifact?: RightsArtifact | null
}

export type JobStatus =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'partial'
  | 'review'
  | 'completed'
  | 'failed'

export interface JobTimelineEntry {
  at: ISODate
  label: string
  tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface Job {
  id: ID
  name: string
  kind: 'sync' | 'index' | 'export' | 'checkpoint' | 'evaluate' | 'rights' | 'import'
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

export interface IntegrityFailure {
  sequence: number
  reason_code: string
  detail: string
}

export interface IntegrityIncident {
  id: ID
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | string
  firstFailureSequence: number
  reasonCode: string
  reasonMessage: string
  detectedAt: ISODate
  linkedBreachIncidentId?: ID | null
}

export interface IntegritySummary {
  status: 'verified' | 'failed' | 'unverified'
  evidenceState: string
  trustedThroughSequence: number | null
  failureSequence: number | null
  reasonCode: string | null
  failures: IntegrityFailure[]
  gateState: 'OPEN' | 'BLOCKED' | string
  incidentId: ID | null
  checkpointStatus: string | null
  verifiedAt: ISODate | null
  disclaimer: string
  incidents: IntegrityIncident[]
  breachCounts: Record<string, number>
}

export interface RightsHold {
  id: ID
  subjectRef: ID | null
  sourceId: ID | null
  recordRefId: ID | null
  reasonCode: string
  status: string
  expiresAt: ISODate | null
  createdAt: ISODate | null
  reviewNote?: string | null
}

export interface BreachIncident {
  id: ID
  incidentRef: string
  title: string
  description: string
  origin: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string
  status: string
  scopeStatus: string
  detectedAt: ISODate
  assessmentDueAt: ISODate
  timerState: 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'COMPLETE' | string
  notifiable: boolean | null
  assessmentTimeliness: string | null
  affectedSubjects: number
  affectedSources: number
  notificationStatus: string
  linkedIntegrityIncidentId?: ID | null
}

export interface ActivePolicy {
  id: ID
  name: string
  version: number
  status: string
  rules: { key: string; value: string }[]
}

export interface DemoFlags {
  failureInjectionEnabled: boolean
  resetAvailable: boolean
  syntheticContactsAvailable: boolean
  userSubjectRef: ID | null
}

export interface DemoData {
  schemaVersion?: string
  workspace?: { id: ID; ref: string; name: string }
  generatedAt?: ISODate
  seededAt: ISODate
  notice: string
  contactMode?: 'masked' | 'synthetic'
  customers: Customer[]
  sources: DataSource[]
  documents: DocumentRecord[]
  policies: PolicyDecision[]
  activePolicy?: ActivePolicy | null
  campaigns: Campaign[]
  campaignRecipients: CampaignRecipient[]
  rightsRequests: RightsRequest[]
  rightsHolds?: RightsHold[]
  jobs: Job[]
  auditEvents: AuditEvent[]
  checkpoints: IntegrityCheckpoint[]
  integrity?: IntegritySummary
  breaches?: BreachIncident[]
  demo?: DemoFlags
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
