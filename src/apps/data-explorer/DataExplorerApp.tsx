import {
  ArrowUpDown,
  Database,
  FileSearch,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { selectDocumentLibrary, selectImportSummary, selectSourceSummaries } from '@/data/selectors'
import { formatDate, formatFileSize } from '@/lib/format'
import { importLabels, importTone, sensitivityTone } from '@/lib/document-meta'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import {
  useWindows,
  type WindowPayload,
  type WorkspaceSection,
} from '@/store/window-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Progress } from '@/components/ui/progress'
import { SectionLabel } from '@/components/ui/panel'
import { Skeleton, StateBlock } from '@/components/ui/state-block'
import { DocumentDetail } from './DocumentDetail'

type ImportFilter = 'all' | 'needs-review' | 'in-progress' | 'failed' | 'missing'
type SortKey = 'name' | 'modified'

export function DataExplorerApp({
  payload,
  onNavigate,
}: {
  payload?: WindowPayload
  onNavigate: (section: WorkspaceSection, patch?: WindowPayload) => void
}) {
  const { data, status, error, refresh, refreshing } = useDemo()
  const { showApp } = useWindows()
  const [sourceId, setSourceId] = useState<string>(payload?.sourceId ?? 'all')
  const [search, setSearch] = useState(payload?.search ?? '')
  const [importFilter, setImportFilter] = useState<ImportFilter>('all')
  const [customerFilter, setCustomerFilter] = useState<string | undefined>(payload?.customerId)
  const [selectedId, setSelectedId] = useState<string | null>(payload?.documentId ?? null)
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'modified',
    direction: 'desc',
  })
  const autoSelected = useRef(false)

  useEffect(() => {
    if (autoSelected.current || selectedId || status !== 'ready' || !data) return
    autoSelected.current = true
    const preferred =
      data.documents.find((document) => document.reviewStatus === 'needs-review') ??
      data.documents[0]
    if (preferred) setSelectedId(preferred.id)
  }, [status, data, selectedId])

  useEffect(() => {
    if (payload?.documentId) setSelectedId(payload.documentId)
  }, [payload?.documentId])

  useEffect(() => {
    if (payload?.customerId) setCustomerFilter(payload.customerId)
  }, [payload?.customerId])

  useEffect(() => {
    if (payload?.sourceId) setSourceId(payload.sourceId)
  }, [payload?.sourceId])

  useEffect(() => {
    if (payload?.search !== undefined) setSearch(payload.search)
  }, [payload?.search])

  const documents = useMemo(() => {
    if (!data) return []
    const filtered = selectDocumentLibrary(data, {
      search,
      sourceId,
      customerId: customerFilter,
      importStates:
        importFilter === 'failed'
          ? ['failed']
          : importFilter === 'missing'
            ? ['missing']
            : importFilter === 'in-progress'
              ? ['importing', 'queued']
              : undefined,
      reviewStatus: importFilter === 'needs-review' ? 'needs-review' : 'all',
    })
    return [...filtered].sort((a, b) => {
      const compare =
        sort.key === 'name'
          ? a.name.localeCompare(b.name)
          : a.modifiedAt.localeCompare(b.modifiedAt)
      return sort.direction === 'asc' ? compare : -compare
    })
  }, [data, search, sourceId, customerFilter, importFilter, sort])

  if (status === 'loading' || (status === 'ready' && !data)) {
    return <DataExplorerSkeleton />
  }

  if (status === 'error' || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <StateBlock
          tone="error"
          title="The record library could not load"
          description={error ?? 'The synthetic repository did not respond.'}
        >
          <Button variant="gold" onClick={() => void refresh()}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        </StateBlock>
      </div>
    )
  }

  const sources = selectSourceSummaries(data)
  const importSummary = selectImportSummary(data)
  const reviewCount = data.documents.filter(
    (document) => document.reviewStatus === 'needs-review',
  ).length
  const selected = data.documents.find((document) => document.id === selectedId) ?? null
  const customer = customerFilter
    ? data.customers.find((entry) => entry.id === customerFilter)
    : undefined
  const indexedCount = data.documents.filter(
    (document) => document.importState === 'indexed',
  ).length

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'name' ? 'asc' : 'desc' },
    )
  }

  const clearFilters = () => {
    setSourceId('all')
    setImportFilter('all')
    setCustomerFilter(undefined)
    setSearch('')
  }

  const filterCounts: Record<ImportFilter, number> = {
    all: data.documents.length,
    'needs-review': reviewCount,
    'in-progress': importSummary.importing + importSummary.queued,
    failed: importSummary.failed,
    missing: importSummary.missing,
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/20 bg-gold-soft text-gold-ink">
          <Database className="size-4" strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[13.5px] font-semibold text-ink">Record library</h1>
            <Badge tone="gold" dot>
              Synthetic
            </Badge>
          </div>
          <p className="mt-0.5 text-[10.5px] text-ink-faint">
            {indexedCount} indexed · {reviewCount} need review · {data.sources.length} sources
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="relative hidden items-center md:flex">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-faint" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search records, customers, tags"
              aria-label="Search records"
              className="h-8 w-60 rounded-md border border-line-strong bg-panel pl-8 pr-7 text-[11px] text-ink outline-none transition-colors placeholder:text-ink-faint/80 focus:border-gold/60 focus:ring-2 focus:ring-gold/10 lg:w-72"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1.5 flex size-5 items-center justify-center rounded text-ink-faint hover:bg-panel-muted hover:text-ink"
              >
                <X className="size-3" />
              </button>
            )}
          </label>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh record library"
            title="Refresh record library"
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[208px_minmax(0,1fr)_348px]">
        <aside className="flex min-h-0 flex-col border-r border-line bg-surface/60">
          <div className="px-4 pb-1.5 pt-4">
            <SectionLabel>Sources</SectionLabel>
          </div>
          <nav className="scroll-thin min-h-0 overflow-y-auto px-2 pb-2" aria-label="Sources">
            <button
              type="button"
              aria-pressed={sourceId === 'all'}
              onClick={() => setSourceId('all')}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                sourceId === 'all'
                  ? 'bg-gold-soft/70 font-medium text-ink ring-1 ring-inset ring-gold/20'
                  : 'text-ink-soft hover:bg-panel-muted',
              )}
            >
              <Database className="size-3.5 text-gold-ink/70" />
              <span className="flex-1 truncate">All sources</span>
              <span className="text-[10px] text-ink-faint tnum">{data.documents.length}</span>
            </button>
            {sources.map(({ source, documentCount }) => (
              <button
                key={source.id}
                type="button"
                aria-pressed={sourceId === source.id}
                onClick={() => setSourceId(source.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                  sourceId === source.id
                    ? 'bg-gold-soft/70 font-medium text-ink ring-1 ring-inset ring-gold/20'
                    : 'text-ink-soft hover:bg-panel-muted',
                )}
                title={source.note ?? `${source.provider} · ${source.status}`}
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    source.status === 'connected'
                      ? 'bg-success'
                      : source.status === 'degraded'
                        ? 'bg-warning'
                        : 'bg-danger',
                  )}
                  aria-hidden
                />
                <span className="flex-1 truncate">{source.name}</span>
                <span className="text-[10px] text-ink-faint tnum">{documentCount}</span>
              </button>
            ))}
          </nav>

          <div className="border-t border-line px-4 pb-1.5 pt-3">
            <SectionLabel>Import state</SectionLabel>
          </div>
          <nav className="px-2 pb-3" aria-label="Import state filters">
            {(
              [
                ['all', 'All records', filterCounts.all],
                ['needs-review', 'Needs review', filterCounts['needs-review']],
                ['in-progress', 'In progress', filterCounts['in-progress']],
                ['failed', 'Failed', filterCounts.failed],
                ['missing', 'Missing data', filterCounts.missing],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={importFilter === value}
                onClick={() => setImportFilter(value)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                  importFilter === value
                    ? 'bg-panel font-medium text-ink shadow-sm ring-1 ring-inset ring-line-strong'
                    : 'text-ink-soft hover:bg-panel-muted',
                )}
              >
                <span className="flex-1 truncate">{label}</span>
                <span
                  className={cn(
                    'rounded px-1 text-[9.5px] tnum',
                    value === 'failed' && count > 0
                      ? 'bg-danger-soft text-danger'
                      : value === 'needs-review' && count > 0
                        ? 'bg-warning-soft text-warning'
                        : 'text-ink-faint',
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
          </nav>

          <div className="mt-auto border-t border-line p-3">
            <div className="rounded-lg border border-line bg-panel px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-ink-soft">
                <ShieldCheck className="size-3 text-gold" />
                Classification coverage
              </div>
              <Progress
                value={
                  (data.documents.filter((document) => document.reviewStatus !== 'needs-review')
                    .length /
                    data.documents.length) *
                  100
                }
                tone="gold"
                className="mt-2 h-1"
                label="Classification coverage"
              />
              <p className="mt-1.5 text-[9.5px] leading-4 text-ink-faint">
                {reviewCount} records still need a human decision.
              </p>
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col bg-canvas">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
            <p className="text-[11px] font-semibold text-ink">
              Records
              <span className="ml-1.5 font-normal text-ink-faint tnum">
                {documents.length} of {data.documents.length}
              </span>
            </p>
            {customer && (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold-soft px-2 py-0.5 text-[10px] font-medium text-gold-ink">
                {customer.company}
                <button
                  type="button"
                  onClick={() => setCustomerFilter(undefined)}
                  aria-label={`Clear ${customer.company} filter`}
                  className="rounded-full p-0.5 hover:bg-gold/20"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            )}
            {(importFilter !== 'all' || sourceId !== 'all' || search || customer) && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto text-[10px] text-ink-faint hover:text-ink"
              >
                Clear filters
              </button>
            )}
            <span className="ml-auto hidden items-center gap-1 text-[10px] text-ink-faint sm:flex">
              <span className="size-1.5 rounded-full bg-success" /> Live demo repository
            </span>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-auto">
            {documents.length === 0 ? (
              <StateBlock
                icon={Search}
                title="No records match these filters"
                description="Try a different source, clear the import filter, or search for a customer or tag."
              >
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              </StateBlock>
            ) : (
              <table className="w-full min-w-[560px] table-fixed border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-panel/95 backdrop-blur">
                  <tr className="border-b border-line text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-faint">
                    <th className="w-[35%] px-3 py-2 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort('name')}
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        Name
                        <ArrowUpDown
                          className={cn('size-2.5', sort.key === 'name' && 'text-gold')}
                        />
                      </button>
                    </th>
                    <th className="w-[23%] px-2 py-2 font-semibold">Customer</th>
                    <th className="w-[15%] px-2 py-2 font-semibold">Import</th>
                    <th className="w-[14%] px-2 py-2 font-semibold">Sensitivity</th>
                    <th className="w-[13%] px-2 py-2 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort('modified')}
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        Modified
                        <ArrowUpDown
                          className={cn('size-2.5', sort.key === 'modified' && 'text-gold')}
                        />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {documents.map((document) => {
                    const customerRecord = data.customers.find(
                      (entry) => entry.id === document.customerId,
                    )
                    const source = data.sources.find((entry) => entry.id === document.sourceId)
                    const active = selectedId === document.id
                    return (
                      <tr
                        key={document.id}
                        tabIndex={0}
                        aria-selected={active}
                        onClick={() => setSelectedId(document.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedId(document.id)
                          }
                        }}
                        className={cn(
                          'cursor-pointer text-[11px] transition-colors outline-none',
                          active
                            ? 'bg-gold-soft/40 shadow-[inset_2px_0_0_0_#B7892F]'
                            : 'hover:bg-panel-muted/50 focus-visible:bg-panel-muted/60',
                        )}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <DocumentIcon kind={document.kind} className="size-8" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">{document.name}</p>
                              <p className="mt-0.5 line-clamp-1 text-[10px] text-ink-faint">
                                {source?.name} · {document.snippet}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <p className="truncate text-[10.5px] text-ink-soft">
                            {customerRecord?.company ?? '—'}
                          </p>
                          {customerRecord && (
                            <p className="truncate text-[9.5px] text-ink-faint">
                              {customerRecord.name}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <Badge tone={importTone[document.importState]}>
                            {importLabels[document.importState]}
                          </Badge>
                        </td>
                        <td className="px-2 py-2">
                          <Badge tone={sensitivityTone[document.sensitivity]} className="capitalize">
                            {document.sensitivity}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 text-[10px] text-ink-faint tnum">
                          <p className="truncate">{formatDate(document.modifiedAt)}</p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-line bg-surface px-3 text-[9.5px] text-ink-faint">
            <span>
              {documents.length} record{documents.length === 1 ? '' : 's'} shown
            </span>
            <span className="h-3 w-px bg-line" />
            <span>
              {data.documents.filter((document) => document.reviewStatus === 'needs-review').length}{' '}
              awaiting classification review
            </span>
            <span className="ml-auto tnum">
              {formatFileSize(data.documents.reduce((total, document) => total + document.sizeKb, 0))}{' '}
              total
            </span>
          </footer>
        </main>

        <aside className="flex min-h-0 flex-col border-l border-line bg-panel">
          {selected ? (
            <DocumentDetail
              key={selected.id}
              document={selected}
              data={data}
              onClose={() => setSelectedId(null)}
              onFilterCustomer={(customerId) => setCustomerFilter(customerId)}
              onOpenVault={() => onNavigate('vault', { documentId: selected.id })}
              onOpenExplorer={() => showApp('file-explorer', { documentId: selected.id })}
              onOpenControlCenter={() => onNavigate('overview')}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <StateBlock
                icon={FileSearch}
                title="Select a record"
                description="Choose a row to inspect detected fields, sensitivity, import state and a schema preview."
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function DataExplorerSkeleton() {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="flex h-14 items-center justify-between border-b border-line bg-surface px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-2 w-56" />
          </div>
        </div>
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[208px_minmax(0,1fr)_348px]">
        <div className="space-y-3 border-r border-line bg-surface/60 p-4">
          <Skeleton className="h-2 w-16" />
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
        <div className="space-y-3 border-l border-line p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  )
}
