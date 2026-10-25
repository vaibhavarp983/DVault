import {
  ArrowUpRight,
  CheckCircle2,
  Fingerprint,
  FolderOpen,
  Lock,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Unlock,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentKind, DocumentRecord } from '@/domain/types'
import { formatDateTime, formatFileSize, formatRelative } from '@/lib/format'
import { fnv1a } from '@/lib/integrity'
import { documentTypeLabel } from '@/data/selectors'
import { importLabels, reviewLabels } from '@/lib/document-meta'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import {
  useWindows,
  type WindowPayload,
  type WorkspaceSection,
} from '@/store/window-provider'
import { Button } from '@/components/ui/button'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Progress } from '@/components/ui/progress'
import { Skeleton, StateBlock } from '@/components/ui/state-block'

type CollectionId =
  | 'all'
  | 'clients'
  | 'agreements'
  | 'financial'
  | 'consent'
  | 'correspondence'
  | 'reports'

const collections: {
  id: CollectionId
  label: string
  hint: string
  kinds?: DocumentKind[]
}[] = [
  { id: 'all', label: 'All records', hint: 'Every sealed item' },
  { id: 'clients', label: 'Client records', hint: 'CRM accounts', kinds: ['crm-record'] },
  { id: 'agreements', label: 'Agreements', hint: 'Signed contracts', kinds: ['contract'] },
  {
    id: 'financial',
    label: 'Financial',
    hint: 'Invoices & purchase orders',
    kinds: ['invoice', 'purchase-order'],
  },
  {
    id: 'consent',
    label: 'Consent & rights',
    hint: 'Consent and request forms',
    kinds: ['consent-record', 'form'],
  },
  {
    id: 'correspondence',
    label: 'Correspondence',
    hint: 'Mail and conversations',
    kinds: ['email', 'conversation'],
  },
  {
    id: 'reports',
    label: 'Notes & reports',
    hint: 'Working material',
    kinds: ['note', 'spreadsheet'],
  },
]

const darkSensitivity: Record<DocumentRecord['sensitivity'], string> = {
  public: 'border-white/15 bg-white/[0.06] text-white/60',
  internal: 'border-white/15 bg-white/[0.06] text-white/65',
  confidential: 'border-gold/25 bg-gold/10 text-gold-bright',
  restricted: 'border-danger/30 bg-danger/10 text-[#f0a094]',
}

export function VaultSection({
  payload,
  onNavigate,
}: {
  payload?: WindowPayload
  onNavigate: (section: WorkspaceSection, patch?: WindowPayload) => void
}) {
  const { data, status, error, refresh, pushNotification } = useDemo()
  const { showApp } = useWindows()
  const [collection, setCollection] = useState<CollectionId>('all')
  const [search, setSearch] = useState('')
  const [locked, setLocked] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(payload?.documentId ?? null)
  const autoSelected = useRef(false)

  useEffect(() => {
    if (payload?.documentId) {
      setSelectedId(payload.documentId)
      setCollection('all')
    }
  }, [payload?.documentId])

  useEffect(() => {
    if (autoSelected.current || selectedId || !data) return
    autoSelected.current = true
    const preferred =
      data.documents.find((document) => document.reviewStatus === 'needs-review') ??
      data.documents[0]
    if (preferred) setSelectedId(preferred.id)
  }, [data, selectedId])

  const documents = useMemo(() => {
    if (!data) return []
    const active = collections.find((entry) => entry.id === collection)
    const term = search.trim().toLowerCase()
    return data.documents
      .filter((document) => !active?.kinds || active.kinds.includes(document.kind))
      .filter((document) => {
        if (!term) return true
        const customer = data.customers.find((entry) => entry.id === document.customerId)
        return [document.name, document.snippet, document.tags.join(' '), customer?.company ?? '']
          .join(' ')
          .toLowerCase()
          .includes(term)
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  }, [data, collection, search])

  if (status === 'loading' || (status === 'ready' && !data)) {
    return <VaultSkeleton />
  }

  if (status === 'error' || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-[#191713]">
        <StateBlock
          tone="error"
          title="The vault could not open"
          description={error ?? 'The synthetic repository did not respond.'}
        >
          <Button variant="gold" onClick={() => void refresh()}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        </StateBlock>
      </div>
    )
  }

  const selected = data.documents.find((document) => document.id === selectedId) ?? null
  const checkpoint = data.checkpoints[data.checkpoints.length - 1]
  const counts = new Map<CollectionId, number>()
  for (const entry of collections) {
    counts.set(
      entry.id,
      data.documents.filter((document) => !entry.kinds || entry.kinds.includes(document.kind))
        .length,
    )
  }

  const toggleLock = () => {
    const next = !locked
    setLocked(next)
    pushNotification({
      title: next ? 'Vault locked' : 'Vault unlocked',
      body: next
        ? 'All sealed records are hidden until the demo vault is unlocked.'
        : 'The synthetic vault is open for this session. No credentials were used.',
      tone: next ? 'info' : 'success',
      appId: 'vault',
    })
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#191713] text-white">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.08] bg-white/[0.025] px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-md border border-gold/20 bg-gold/10 text-gold-bright">
            <LockKeyhole className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[12px] font-semibold tracking-tight text-white">
                Sealed records
              </h1>
              <span className="rounded border border-gold/25 bg-gold/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-gold-bright">
                Vault
              </span>
            </div>
            <p className="mt-0.5 truncate text-[9px] text-white/30">
              Local encryption simulation · no credentials are used
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="relative hidden items-center sm:flex">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-white/30" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={locked}
              placeholder="Search the vault"
              aria-label="Search the vault"
              className="h-8 w-52 rounded-md border border-white/10 bg-white/[0.04] pl-8 pr-7 text-[11px] text-white/85 outline-none transition-colors placeholder:text-white/25 focus:border-gold/50 focus:bg-white/[0.06] disabled:opacity-40 lg:w-64"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear vault search"
                className="absolute right-1.5 flex size-5 items-center justify-center rounded text-white/35 hover:bg-white/10 hover:text-white/80"
              >
                <X className="size-3" />
              </button>
            )}
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleLock}
            className="border-white/12 bg-white/[0.04] text-white/75 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
          >
            {locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
            {locked ? 'Unlock' : 'Lock vault'}
          </Button>
        </div>
      </header>

      <div
        className="grid min-h-0 flex-1 grid-cols-[202px_minmax(0,1fr)_334px]"
        inert={locked}
        aria-hidden={locked}
      >
        <aside className="flex min-h-0 flex-col border-r border-white/[0.07] bg-white/[0.015]">
          <div className="px-4 pb-2 pt-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/30">
              Collections
            </p>
          </div>
          <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2" aria-label="Vault collections">
            {collections.map((entry) => {
              const active = collection === entry.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCollection(entry.id)}
                  className={cn(
                    'group mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    active
                      ? 'bg-gold/15 text-gold-bright ring-1 ring-inset ring-gold/20'
                      : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium">{entry.label}</span>
                    <span className="block truncate text-[9px] text-white/25">{entry.hint}</span>
                  </span>
                  <span className="text-[9.5px] text-white/30 tnum">{counts.get(entry.id)}</span>
                </button>
              )
            })}
          </nav>

          <div className="border-t border-white/[0.07] p-3">
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5">
              <div className="flex items-center gap-1.5 text-[9.5px] font-medium text-white/70">
                <ShieldCheck className="size-3.5 text-gold-bright" />
                Integrity sealed
              </div>
              <p className="mt-1 text-[9px] leading-4 text-white/30">
                {data.auditEvents.length} events chained ·{' '}
                {checkpoint ? `checkpoint ${formatRelative(checkpoint.at)}` : 'no checkpoint'}
              </p>
              <div className="mt-2 rounded border border-white/[0.07] bg-black/20 px-1.5 py-1 font-mono text-[8.5px] text-white/25">
                {checkpoint ? checkpoint.hash.slice(0, 18) : 'unsealed'}
              </div>
            </div>
            <p className="mt-2.5 flex items-start gap-1.5 text-[8.5px] leading-3.5 text-white/20">
              <Sparkles className="mt-0.5 size-2.5 shrink-0" />
              No real personal data. The vault is a local simulation.
            </p>
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.07] px-4">
            <p className="text-[10.5px] font-semibold text-white/75">
              {collections.find((entry) => entry.id === collection)?.label}
            </p>
            <span className="text-[9.5px] text-white/30 tnum">{documents.length} records</span>
            {search && (
              <span className="ml-auto flex items-center gap-1 text-[9px] text-white/30">
                Filtered by “{search}”
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search filter"
                  className="rounded p-0.5 hover:bg-white/10"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            )}
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {documents.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6">
                <div className="text-center">
                  <span className="mx-auto flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/30">
                    <Search className="size-5" />
                  </span>
                  <p className="mt-2 text-[11.5px] font-medium text-white/60">No sealed records</p>
                  <p className="mt-1 text-[9.5px] leading-4 text-white/30">
                    Try another collection or clear the vault search.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {documents.map((document) => {
                  const customer = data.customers.find(
                    (entry) => entry.id === document.customerId,
                  )
                  const active = selectedId === document.id
                  return (
                    <li key={document.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(document.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors',
                          active
                            ? 'bg-white/[0.06] shadow-[inset_2px_0_0_0_#C9A24E]'
                            : 'hover:bg-white/[0.035]',
                        )}
                      >
                        <DocumentIcon
                          kind={document.kind}
                          className="size-8 border-white/10"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[11px] font-medium text-white/85">
                              {document.name}
                            </span>
                            {document.sensitivity === 'restricted' && (
                              <LockKeyhole className="size-2.5 shrink-0 text-gold-bright/80" />
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-[9.5px] text-white/30">
                            {customer?.company ?? 'Unlinked'} · {formatRelative(document.modifiedAt)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded border px-1.5 py-0.5 text-[8.5px] capitalize',
                            darkSensitivity[document.sensitivity],
                          )}
                        >
                          {document.sensitivity}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="flex h-8 shrink-0 items-center gap-2 border-t border-white/[0.07] px-4 text-[9px] text-white/25">
            <Fingerprint className="size-3 text-gold/70" />
            {data.documents.length} sealed records · {data.sources.length} linked sources
            <span className="ml-auto">Synthetic demo data</span>
          </div>
        </main>

        <aside className="min-h-0 border-l border-white/[0.07] bg-white/[0.02]">
          {selected ? (
            <VaultPreview
              document={selected}
              customerName={
                data.customers.find((entry) => entry.id === selected.customerId)?.company ??
                'Unlinked record'
              }
              sourceName={
                data.sources.find((entry) => entry.id === selected.sourceId)?.name ?? 'Unknown'
              }
              onClose={() => setSelectedId(null)}
              onOpenExplorer={() =>
                showApp('file-explorer', { documentId: selected.id })
              }
              onOpenDataExplorer={() =>
                onNavigate('records', { documentId: selected.id })
              }
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/25">
                <LockKeyhole className="size-5" />
              </span>
              <p className="text-[11.5px] font-medium text-white/55">Select a sealed record</p>
              <p className="text-[9.5px] leading-4 text-white/25">
                Inspect content, detected fields and the record seal without leaving the vault.
              </p>
            </div>
          )}
        </aside>
      </div>

      {locked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vault locked"
          className="absolute inset-x-0 bottom-0 top-14 z-20 flex flex-col items-center justify-center gap-4 bg-[#161410]/96 backdrop-blur-md"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl border border-gold/25 bg-gold/10 text-gold-bright shadow-[0_0_50px_rgba(201,162,78,0.18)]">
            <Lock className="size-6" strokeWidth={1.7} />
          </span>
          <div className="max-w-xs text-center">
            <p className="text-[15px] font-semibold text-white/85">Vault locked</p>
            <p className="mt-1.5 text-[10.5px] leading-5 text-white/35">
              Records, previews and search are hidden. In this demo, unlocking needs no password —
              it simply restores the synthetic workspace.
            </p>
          </div>
          <Button variant="gold" size="sm" autoFocus onClick={toggleLock}>
            <Unlock className="size-3.5" /> Unlock demo vault
          </Button>
          <p className="text-[9px] uppercase tracking-[0.16em] text-white/20">
            Local simulation · no credentials
          </p>
        </div>
      )}
    </div>
  )
}

function VaultPreview({
  document,
  customerName,
  sourceName,
  onClose,
  onOpenExplorer,
  onOpenDataExplorer,
}: {
  document: DocumentRecord
  customerName: string
  sourceName: string
  onClose: () => void
  onOpenExplorer: () => void
  onOpenDataExplorer: () => void
}) {
  const seal = fnv1a(`${document.id}:${document.modifiedAt}`)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/[0.07] px-4 pb-3 pt-3.5">
        <div className="flex items-start gap-2.5">
          <DocumentIcon kind={document.kind} className="size-9 border-white/10" />
          <div className="min-w-0 flex-1">
            <p className="break-words text-[11.5px] font-semibold leading-[1.4] text-white/90">
              {document.name}
            </p>
            <p className="mt-0.5 text-[9px] text-white/30">
              {documentTypeLabel(document.kind)} · {formatFileSize(document.sizeKb)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close vault preview"
            onClick={onClose}
            className="-mr-1 -mt-1 flex size-6 items-center justify-center rounded text-white/30 hover:bg-white/10 hover:text-white/80"
          >
            <X className="size-3" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 text-[8.5px] capitalize',
              darkSensitivity[document.sensitivity],
            )}
          >
            {document.sensitivity}
          </span>
          <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[8.5px] text-white/50">
            {importLabels[document.importState]}
          </span>
          <span className="flex items-center gap-1 rounded border border-gold/20 bg-gold/[0.08] px-1.5 py-0.5 text-[8.5px] text-gold-bright/90">
            <LockKeyhole className="size-2.5" /> Sealed
          </span>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25">
            Preview
          </p>
          <p className="mt-1.5 text-[10px] leading-5 text-white/55">{document.snippet}</p>
        </div>

        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25">
            Metadata
          </p>
          <dl className="mt-1.5 space-y-1 text-[9.5px]">
            <VaultMeta label="Customer" value={customerName} />
            <VaultMeta label="Source" value={sourceName} />
            <VaultMeta label="Modified" value={formatDateTime(document.modifiedAt)} />
            <VaultMeta label="Review" value={reviewLabels[document.reviewStatus]} />
          </dl>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25">
              Detected fields
            </p>
            <span className="text-[8.5px] text-white/20">{document.fields.length}</span>
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {document.fields.slice(0, 5).map((field) => (
              <li key={field.field}>
                <div className="flex items-center justify-between gap-2 text-[9.5px]">
                  <span className="truncate text-white/55">{field.field}</span>
                  <span className="shrink-0 text-white/25 tnum">
                    {Math.round(field.confidence * 100)}%
                  </span>
                </div>
                <Progress
                  value={field.confidence * 100}
                  tone={field.confidence < 0.8 ? 'warning' : 'gold'}
                  className="mt-1 h-0.5 bg-white/10"
                  label={`${field.field} confidence`}
                />
              </li>
            ))}
          </ul>
        </div>

        {document.missing && document.missing.length > 0 && (
          <div className="rounded-lg border border-warning/25 bg-warning/[0.07] px-2.5 py-2">
            <p className="text-[9px] font-medium text-[#e4b15f]">Incomplete evidence</p>
            <ul className="mt-1 space-y-0.5 text-[9px] leading-4 text-white/35">
              {document.missing.map((entry) => (
                <li key={entry}>· {entry}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-[8.5px] uppercase tracking-[0.12em] text-white/25">
            <Fingerprint className="size-3 text-gold/70" /> Record seal
          </p>
          <p className="mt-1 break-all font-mono text-[8.5px] leading-4 text-white/35">{seal}</p>
        </div>

        <div className="flex flex-wrap gap-1">
          {document.tags.map((tag) => (
            <span
              key={tag}
              className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[8.5px] text-white/35"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-white/[0.07] p-3">
        <Button variant="gold" size="sm" className="w-full" onClick={onOpenDataExplorer}>
          <ArrowUpRight className="size-3.5" /> Inspect in Data Explorer
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full border-white/10 bg-white/[0.03] text-white/65 hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          onClick={onOpenExplorer}
        >
          <FolderOpen className="size-3.5" /> Show in File Explorer
        </Button>
        <p className="flex items-center justify-center gap-1 text-[8.5px] text-white/20">
          <CheckCircle2 className="size-2.5 text-success" />
          Hash chained · synthetic identity
        </p>
      </div>
    </div>
  )
}

function VaultMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="shrink-0 text-white/25">{label}</dt>
      <dd className="truncate text-right text-white/55">{value}</dd>
    </div>
  )
}

function VaultSkeleton() {
  return (
    <div className="flex h-full flex-col bg-[#191713]">
      <div className="flex h-12 items-center justify-between border-b border-white/[0.08] px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-7 rounded-lg bg-white/10" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24 bg-white/10" />
            <Skeleton className="h-2 w-40 bg-white/5" />
          </div>
        </div>
        <Skeleton className="h-8 w-40 bg-white/10" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[202px_minmax(0,1fr)_334px]">
        <div className="space-y-2 border-r border-white/[0.07] p-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-7 bg-white/5" />
          ))}
        </div>
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-9 bg-white/[0.04]" />
          ))}
        </div>
        <div className="space-y-3 border-l border-white/[0.07] p-4">
          <Skeleton className="h-4 w-40 bg-white/10" />
          <Skeleton className="h-24 bg-white/5" />
          <Skeleton className="h-3 w-3/4 bg-white/5" />
          <Skeleton className="h-3 w-1/2 bg-white/5" />
        </div>
      </div>
    </div>
  )
}
