import type { UserDocument, UserRequestStatus, UserWorkspace } from '@/domain/user'

export function selectUserSummary(workspace: UserWorkspace) {
  const optionalConsents = workspace.consents.filter((consent) => !consent.required)
  const activeConsents = optionalConsents.filter((consent) => consent.granted).length
  const openRequests = workspace.requests.filter((request) => request.status !== 'complete')
  const failedRequests = workspace.requests.filter((request) => request.status === 'failed')
  return {
    sources: workspace.sources.length,
    records: workspace.documents.length,
    activeConsents,
    optionalConsents: optionalConsents.length,
    requiredConsents: workspace.consents.filter((consent) => consent.required).length,
    openRequests: openRequests.length,
    failedRequests: failedRequests.length,
    completeRequests: workspace.requests.filter((request) => request.status === 'complete').length,
  }
}

export function selectConsentHealth(workspace: UserWorkspace) {
  const optional = workspace.consents.filter((consent) => !consent.required)
  const active = optional.filter((consent) => consent.granted).length
  return {
    active,
    total: optional.length,
    percent: optional.length ? Math.round((active / optional.length) * 100) : 0,
  }
}

export function selectOpenRequests(workspace: UserWorkspace) {
  return workspace.requests
    .filter((request) => request.status !== 'complete')
    .slice()
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
}

export function selectRequestCounts(workspace: UserWorkspace): Record<UserRequestStatus, number> {
  return {
    open: workspace.requests.filter((request) => request.status === 'open').length,
    'in-progress': workspace.requests.filter((request) => request.status === 'in-progress').length,
    failed: workspace.requests.filter((request) => request.status === 'failed').length,
    complete: workspace.requests.filter((request) => request.status === 'complete').length,
  }
}

export interface UserDocumentFilters {
  search?: string
  sourceId?: string
}

export function selectUserDocuments(
  workspace: UserWorkspace,
  filters: UserDocumentFilters = {},
): UserDocument[] {
  const term = filters.search?.trim().toLowerCase() ?? ''
  return workspace.documents
    .filter((document) => {
      if (filters.sourceId && filters.sourceId !== 'all' && document.sourceId !== filters.sourceId) {
        return false
      }
      if (!term) return true
      const source = workspace.sources.find((entry) => entry.id === document.sourceId)
      return [
        document.name,
        document.summary,
        document.fields.map((field) => field.field).join(' '),
        source?.name ?? '',
        source?.provider ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function selectUserSource(workspace: UserWorkspace, sourceId: string) {
  return workspace.sources.find((source) => source.id === sourceId)
}

export function selectUserActivity(workspace: UserWorkspace) {
  return [...workspace.activity].sort((a, b) => b.at.localeCompare(a.at))
}

export function selectUserSourceCounts(workspace: UserWorkspace): Map<string, number> {
  const counts = new Map<string, number>()
  for (const source of workspace.sources) counts.set(source.id, 0)
  for (const document of workspace.documents) {
    counts.set(document.sourceId, (counts.get(document.sourceId) ?? 0) + 1)
  }
  return counts
}

export function selectConsent(workspace: UserWorkspace, consentId: string) {
  return workspace.consents.find((consent) => consent.id === consentId)
}
