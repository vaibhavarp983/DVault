import type {
  CampaignDecision,
  CampaignRecipient,
  DemoData,
  DocumentKind,
  DocumentRecord,
  ImportState,
  PolicyOutcome,
  Sensitivity,
} from '@/domain/types'
import { compareDatesDesc } from '@/lib/format'
import { verifyAuditChain, type IntegrityResult } from '@/lib/integrity'

export const DEMO_NOW = '2026-10-24T17:10:00Z'

export function cloneData(data: DemoData): DemoData {
  return structuredClone(data)
}

export function documentTypeLabel(kind: DocumentKind): string {
  switch (kind) {
    case 'invoice':
      return 'Invoice'
    case 'purchase-order':
      return 'Purchase order'
    case 'contract':
      return 'Contract'
    case 'email':
      return 'Email message'
    case 'form':
      return 'Web form'
    case 'consent-record':
      return 'Consent record'
    case 'note':
      return 'Note'
    case 'conversation':
      return 'Conversation'
    case 'crm-record':
      return 'CRM record'
    case 'spreadsheet':
      return 'Spreadsheet'
    case 'rights-request':
      return 'Rights request'
    case 'report':
      return 'Report'
  }
}

export function documentIconKind(kind: DocumentKind): 'pdf' | 'doc' | 'sheet' | 'mail' | 'data' {
  switch (kind) {
    case 'invoice':
    case 'purchase-order':
    case 'contract':
      return 'pdf'
    case 'spreadsheet':
      return 'sheet'
    case 'email':
    case 'conversation':
      return 'mail'
    case 'form':
    case 'consent-record':
    case 'crm-record':
    case 'rights-request':
      return 'data'
    case 'note':
    case 'report':
      return 'doc'
  }
}

export function customerNameFor(data: DemoData, customerId?: string): string | undefined {
  if (!customerId) return undefined
  return data.customers.find((customer) => customer.id === customerId)?.company
}

export function sourceNameFor(data: DemoData, sourceId: string): string {
  return data.sources.find((source) => source.id === sourceId)?.name ?? 'Unknown source'
}

export function documentMatchesSearch(
  document: DocumentRecord,
  search: string,
  data: DemoData,
): boolean {
  if (!search.trim()) return true
  const haystack = [
    document.name,
    document.snippet,
    document.tags.join(' '),
    documentTypeLabel(document.kind),
    customerNameFor(data, document.customerId) ?? '',
    data.customers.find((customer) => customer.id === document.customerId)?.name ?? '',
    sourceNameFor(data, document.sourceId),
  ]
    .join(' ')
    .toLowerCase()
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term))
}

export interface DocumentFilters {
  search?: string
  sourceId?: string
  importStates?: ImportState[]
  reviewStatus?: DocumentRecord['reviewStatus'] | 'all'
  sensitivity?: Sensitivity | 'all'
  customerId?: string
}

export function selectDocumentLibrary(
  data: DemoData,
  filters: DocumentFilters = {},
): DocumentRecord[] {
  return data.documents
    .filter((document) => {
      if (filters.sourceId && filters.sourceId !== 'all' && document.sourceId !== filters.sourceId) {
        return false
      }
      if (filters.importStates?.length && !filters.importStates.includes(document.importState)) {
        return false
      }
      if (
        filters.reviewStatus &&
        filters.reviewStatus !== 'all' &&
        document.reviewStatus !== filters.reviewStatus
      ) {
        return false
      }
      if (
        filters.sensitivity &&
        filters.sensitivity !== 'all' &&
        document.sensitivity !== filters.sensitivity
      ) {
        return false
      }
      if (filters.customerId && document.customerId !== filters.customerId) return false
      return documentMatchesSearch(document, filters.search ?? '', data)
    })
    .sort((a, b) =>
      compareDatesDesc(a.modifiedAt ?? a.createdAt, b.modifiedAt ?? b.createdAt),
    )
}

export function selectDocumentsBySource(data: DemoData): Map<string, number> {
  const counts = new Map<string, number>()
  for (const source of data.sources) counts.set(source.id, 0)
  for (const document of data.documents) {
    counts.set(document.sourceId, (counts.get(document.sourceId) ?? 0) + 1)
  }
  return counts
}

export function selectImportSummary(data: DemoData): Record<ImportState, number> {
  const summary: Record<ImportState, number> = {
    indexed: 0,
    importing: 0,
    queued: 0,
    failed: 0,
    missing: 0,
  }
  for (const document of data.documents) summary[document.importState] += 1
  return summary
}

export function selectSourceSummaries(data: DemoData) {
  const counts = selectDocumentsBySource(data)
  return data.sources.map((source) => ({
    source,
    documentCount: counts.get(source.id) ?? 0,
    indexedCount: data.documents.filter(
      (document) => document.sourceId === source.id && document.importState === 'indexed',
    ).length,
  }))
}

export interface PolicySummary {
  total: number
  allow: number
  deny: number
  review: number
  allowShare: number
  reviewShare: number
  denyShare: number
  weightedScore: number
}

export function selectPolicySummary(data: DemoData): PolicySummary {
  const counts: Record<PolicyOutcome, number> = { allow: 0, deny: 0, review: 0 }
  for (const policy of data.policies) counts[policy.outcome] += 1
  const total = data.policies.length || 1
  return {
    total: data.policies.length,
    ...counts,
    allowShare: (counts.allow / total) * 100,
    reviewShare: (counts.review / total) * 100,
    denyShare: (counts.deny / total) * 100,
    weightedScore: ((counts.allow * 100 + counts.review * 55 + counts.deny * 20) / total),
  }
}

export interface GovernanceHealth {
  score: number
  band: 'strong' | 'fair' | 'attention' | 'critical'
  label: string
  factors: { key: string; label: string; value: number; weight: number; hint: string }[]
  indexedShare: number
  issueCount: number
}

export function selectGovernanceHealth(data: DemoData): GovernanceHealth {
  const sourceHealth =
    data.sources.reduce((total, source) => total + source.health, 0) / (data.sources.length || 1)
  const classification =
    (data.documents.reduce((total, document) => total + document.confidence, 0) /
      (data.documents.length || 1)) *
    100
  const policy = selectPolicySummary(data).weightedScore
  const audit = data.auditEvents.length ? 100 : 0

  const score = Math.round(
    sourceHealth * 0.35 + classification * 0.25 + policy * 0.25 + audit * 0.15,
  )
  const band: GovernanceHealth['band'] =
    score >= 90 ? 'strong' : score >= 75 ? 'fair' : score >= 60 ? 'attention' : 'critical'

  const indexed = data.documents.filter((document) => document.importState === 'indexed').length
  const issueCount =
    data.documents.filter(
      (document) =>
        document.importState === 'failed' ||
        document.importState === 'missing' ||
        document.reviewStatus === 'needs-review',
    ).length + data.sources.filter((source) => source.status !== 'connected').length

  return {
    score,
    band,
    label:
      band === 'strong'
        ? 'Strong'
        : band === 'fair'
          ? 'Fair — a few items need attention'
          : band === 'attention'
            ? 'Needs attention'
            : 'At risk',
    indexedShare: (indexed / (data.documents.length || 1)) * 100,
    issueCount,
    factors: [
      {
        key: 'sources',
        label: 'Source health',
        value: Math.round(sourceHealth),
        weight: 0.35,
        hint: 'Average health across connected systems',
      },
      {
        key: 'classification',
        label: 'Classification confidence',
        value: Math.round(classification),
        weight: 0.25,
        hint: 'Mean confidence of detected fields',
      },
      {
        key: 'policy',
        label: 'Policy alignment',
        value: Math.round(policy),
        weight: 0.25,
        hint: 'Weighted ALLOW / REVIEW / DENY outcomes',
      },
      {
        key: 'audit',
        label: 'Audit integrity',
        value: audit,
        weight: 0.15,
        hint: 'Hash-chain verification result',
      },
    ],
  }
}

export function selectRightsSummary(data: DemoData, now = new Date(DEMO_NOW)) {
  const dueSoon = data.rightsRequests.filter(
    (request) =>
      request.status !== 'complete' &&
      new Date(request.dueAt).getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000,
  ).length

  return {
    total: data.rightsRequests.length,
    open: data.rightsRequests.filter((request) => request.status === 'open').length,
    inProgress: data.rightsRequests.filter((request) => request.status === 'in-progress').length,
    partial: data.rightsRequests.filter((request) => request.status === 'partial').length,
    complete: data.rightsRequests.filter((request) => request.status === 'complete').length,
    failedSources: data.rightsRequests.reduce(
      (total, request) =>
        total + request.sourceProgress.filter((progress) => progress.status === 'failed').length,
      0,
    ),
    dueSoon,
  }
}

export function selectJobSummary(data: DemoData) {
  return {
    running: data.jobs.filter((job) => job.status === 'running').length,
    queued: data.jobs.filter((job) => job.status === 'queued').length,
    retrying: data.jobs.filter((job) => job.status === 'retrying').length,
    failed: data.jobs.filter((job) => job.status === 'failed').length,
    completed: data.jobs.filter((job) => job.status === 'completed').length,
  }
}

export function selectCampaignTotals(data: DemoData, campaignId: string) {
  const recipients = data.campaignRecipients.filter(
    (recipient) => recipient.campaignId === campaignId,
  )
  const decisions: Record<CampaignDecision, number> = { approve: 0, review: 0, block: 0 }
  for (const recipient of recipients) decisions[recipient.decision] += 1
  return {
    campaign: data.campaigns.find((campaign) => campaign.id === campaignId),
    recipients,
    decisions,
    approved: decisions.approve,
    review: decisions.review,
    blocked: decisions.block,
    sent: recipients.filter((recipient) => recipient.status === 'sent').length,
    held: recipients.filter((recipient) => recipient.status === 'held').length,
    pending: recipients.filter((recipient) => recipient.status === 'pending').length,
    executable: recipients.filter(
      (recipient) => recipient.decision === 'approve' && recipient.status === 'pending',
    ).length,
  }
}

export function selectActivitySeries(data: DemoData, days = 14, now = new Date(DEMO_NOW)) {
  const series: { date: string; label: string; value: number }[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000)
    const key = date.toISOString().slice(0, 10)
    const value = data.documents.filter(
      (document) => document.modifiedAt.slice(0, 10) === key,
    ).length
    series.push({
      date: key,
      label: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date),
      value,
    })
  }
  return series
}

export function selectCustomerTrace(data: DemoData, customerId: string) {
  const customer = data.customers.find((entry) => entry.id === customerId)
  if (!customer) {
    return {
      customer: undefined,
      documents: [] as DocumentRecord[],
      policies: [] as DemoData['policies'],
      rightsRequests: [] as DemoData['rightsRequests'],
      recipients: [] as CampaignRecipient[],
      auditEvents: [] as DemoData['auditEvents'],
    }
  }

  return {
    customer,
    documents: data.documents.filter((document) => document.customerId === customerId),
    policies: data.policies.filter((policy) => policy.customerId === customerId),
    rightsRequests: data.rightsRequests.filter((request) => request.customerId === customerId),
    recipients: data.campaignRecipients.filter(
      (recipient) => recipient.customerId === customerId,
    ),
    auditEvents: data.auditEvents.filter(
      (event) =>
        event.target.toLowerCase().includes(customer.company.toLowerCase()) ||
        event.target.toLowerCase().includes(customer.name.toLowerCase()),
    ),
  }
}

export interface ExplorerEntry {
  id: string
  name: string
  kind: 'folder' | 'file'
  typeLabel: string
  modifiedAt: string
  sizeKb?: number
  documentId?: string
  customerId?: string
  folder?: string
  children?: ExplorerEntry[]
}

export function selectFileTree(data: DemoData): ExplorerEntry {
  const root: ExplorerEntry = {
    id: 'root',
    name: 'DVault (D:)',
    kind: 'folder',
    typeLabel: 'File folder',
    modifiedAt: data.seededAt,
    folder: '',
    children: [],
  }

  const folders = new Map<string, ExplorerEntry>([['', root]])
  const ensureFolder = (path: string): ExplorerEntry => {
    if (folders.has(path)) return folders.get(path) as ExplorerEntry
    const segments = path.split('/')
    const name = segments[segments.length - 1] ?? path
    const parent = ensureFolder(segments.slice(0, -1).join('/'))
    const folder: ExplorerEntry = {
      id: `folder:${path}`,
      name,
      kind: 'folder',
      typeLabel: 'File folder',
      modifiedAt: data.seededAt,
      folder: path,
      children: [],
    }
    parent.children?.push(folder)
    folders.set(path, folder)
    return folder
  }

  const folderFor = (document: DocumentRecord): string => {
    switch (document.kind) {
      case 'invoice':
        return 'Finance/Invoices'
      case 'purchase-order':
        return 'Finance/Purchase orders'
      case 'contract':
        return 'Legal/Contracts'
      case 'consent-record':
        return 'Legal/Consent'
      case 'crm-record':
        return `Clients/${
          data.customers.find((customer) => customer.id === document.customerId)?.company ??
          'Unassigned'
        }`
      case 'spreadsheet':
        return 'Reports'
      case 'email':
        return 'Inbox/Mail'
      case 'conversation':
        return 'Inbox/Messages'
      case 'form':
        return 'Inbox/Forms'
      case 'note':
        return 'Inbox/Notes'
      case 'rights-request':
        return 'Legal/Rights'
      case 'report':
        return 'Reports'
    }
  }

  for (const document of data.documents) {
    const path = folderFor(document)
    const folder = ensureFolder(path)
    folder.children?.push({
      id: `file:${document.id}`,
      name: document.name,
      kind: 'file',
      typeLabel: documentTypeLabel(document.kind),
      modifiedAt: document.modifiedAt,
      sizeKb: document.sizeKb,
      documentId: document.id,
      customerId: document.customerId,
      folder: path,
    })
  }

  const finalise = (folder: ExplorerEntry) => {
    if (!folder.children) return
    for (const child of folder.children) {
      if (child.kind === 'folder') finalise(child)
      if (child.modifiedAt > folder.modifiedAt) folder.modifiedAt = child.modifiedAt
    }
    folder.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }
  finalise(root)
  return root
}

export function selectFolderByPath(root: ExplorerEntry, path: string): ExplorerEntry | undefined {
  if (!path) return root
  const segments = path.split('/')
  let current: ExplorerEntry | undefined = root
  for (const segment of segments) {
    current = current?.children?.find(
      (child) => child.kind === 'folder' && child.name === segment,
    )
    if (!current) return undefined
  }
  return current
}

export function selectAuditIntegrity(data: DemoData): IntegrityResult {
  if (data.integrity) {
    const status = data.integrity.status
    return {
      valid: status === 'verified',
      verifiedCount: data.integrity.trustedThroughSequence ?? 0,
      brokenAt:
        status === 'failed'
          ? String(data.integrity.failureSequence ?? data.integrity.reasonCode ?? 'unknown')
          : undefined,
      head: data.auditEvents[data.auditEvents.length - 1]?.hash ?? 'genesis',
      checkpoints: data.checkpoints.map((checkpoint) => ({
        ...checkpoint,
        status:
          status === 'verified' ? 'verified' : status === 'failed' ? 'failed' : checkpoint.status,
      })),
    }
  }
  return verifyAuditChain(data.auditEvents, data.checkpoints)
}

export function selectServerIntegrity(data: DemoData) {
  return data.integrity ?? null
}
