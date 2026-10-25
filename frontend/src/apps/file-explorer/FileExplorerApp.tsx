import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Folder,
  FolderOpen,
  HardDrive,
  LockKeyhole,
  PanelRight,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { DocumentRecord } from '@/domain/types'
import {
  selectFileTree,
  selectFolderByPath,
  type ExplorerEntry,
} from '@/data/selectors'
import {
  importLabels,
  importTone,
  sensitivityTone,
} from '@/lib/document-meta'
import { formatDate, formatDateTime, formatFileSize } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import { useWindows, type WindowPayload } from '@/store/window-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Progress } from '@/components/ui/progress'
import { Skeleton, StateBlock } from '@/components/ui/state-block'

type SortKey = 'name' | 'modified' | 'type' | 'size'

function findFileByDocumentId(node: ExplorerEntry, documentId: string): ExplorerEntry | undefined {
  for (const child of node.children ?? []) {
    if (child.documentId === documentId) return child
    if (child.kind === 'folder') {
      const found = findFileByDocumentId(child, documentId)
      if (found) return found
    }
  }
  return undefined
}

export function FileExplorerApp({ payload }: { payload?: WindowPayload }) {
  const { data, status, error, refresh, refreshing } = useDemo()
  const { showApp } = useWindows()
  const root = useMemo(() => (data ? selectFileTree(data) : undefined), [data])
  const [path, setPath] = useState('')
  const [history, setHistory] = useState<string[]>([''])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  })

  useEffect(() => {
    if (!payload?.documentId || !root) return
    const entry = findFileByDocumentId(root, payload.documentId)
    if (!entry?.folder && entry?.folder !== '') return
    const folderPath = entry.folder ?? ''
    setPath(folderPath)
    setHistory([folderPath])
    setHistoryIndex(0)
    setSelectedId(entry.id)
    setShowPreview(true)
  }, [payload?.documentId, root])

  const folder = root ? selectFolderByPath(root, path) : undefined
  const entries = useMemo(() => {
    const list = folder?.children ?? []
    const term = search.trim().toLowerCase()
    const filtered = term ? list.filter((entry) => entry.name.toLowerCase().includes(term)) : list
    return [...filtered].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      let compare = 0
      if (sort.key === 'name') compare = a.name.localeCompare(b.name)
      if (sort.key === 'modified') {
        compare = (a.modifiedAt ?? '').localeCompare(b.modifiedAt ?? '')
      }
      if (sort.key === 'type') compare = a.typeLabel.localeCompare(b.typeLabel)
      if (sort.key === 'size') compare = (a.sizeKb ?? 0) - (b.sizeKb ?? 0)
      return sort.direction === 'asc' ? compare : -compare
    })
  }, [folder, search, sort])

  if (status === 'loading' || (status === 'ready' && !data)) {
    return <ExplorerSkeleton />
  }

  if (status === 'error' || !data || !root || !folder) {
    return (
      <div className="flex h-full items-center justify-center">
        <StateBlock
          tone="error"
          title="File Explorer could not open DVault (D:)"
          description={error ?? 'The synthetic drive is unavailable.'}
        >
          <Button variant="gold" onClick={() => void refresh()}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        </StateBlock>
      </div>
    )
  }

  const selected = entries.find((entry) => entry.id === selectedId) ?? null
  const selectedDocument = selected?.documentId
    ? data.documents.find((document) => document.id === selected.documentId) ?? null
    : null
  const parentFolders = root.children?.filter((entry) => entry.kind === 'folder') ?? []
  const segments = path ? path.split('/') : []
  const totalBytesKb = data.documents.reduce((total, document) => total + document.sizeKb, 0)

  const navigate = (nextPath: string) => {
    const target = selectFolderByPath(root, nextPath)
    if (!target || target.kind !== 'folder') return
    setPath(nextPath)
    setSearch('')
    setSelectedId(null)
    setHistory((current) => [...current.slice(0, historyIndex + 1), nextPath])
    setHistoryIndex((current) => current + 1)
  }

  const goBack = () => {
    if (historyIndex === 0) return
    const nextIndex = historyIndex - 1
    setHistoryIndex(nextIndex)
    setPath(history[nextIndex] ?? '')
    setSearch('')
    setSelectedId(null)
  }

  const goForward = () => {
    if (historyIndex >= history.length - 1) return
    const nextIndex = historyIndex + 1
    setHistoryIndex(nextIndex)
    setPath(history[nextIndex] ?? '')
    setSearch('')
    setSelectedId(null)
  }

  const goUp = () => {
    if (!path) return
    const parent = segments.slice(0, -1).join('/')
    navigate(parent)
  }

  const openEntry = (entry: ExplorerEntry) => {
    if (entry.kind === 'folder') {
      navigate(entry.folder ?? '')
      return
    }
    if (entry.documentId) {
      showApp('vault', { section: 'vault', documentId: entry.documentId })
    }
  }

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'name' ? 'asc' : 'desc' },
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          disabled={historyIndex === 0}
          onClick={goBack}
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Forward"
          disabled={historyIndex >= history.length - 1}
          onClick={goForward}
        >
          <ArrowRight className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Up one level"
          disabled={!path}
          onClick={goUp}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh"
          onClick={() => void refresh()}
        >
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
        </Button>

        <nav
          className="mx-1 flex h-8 min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-md border border-line-strong bg-panel px-2"
          aria-label="Address bar"
        >
          <HardDrive className="mr-1 size-3.5 shrink-0 text-gold-ink/70" />
          <button
            type="button"
            onClick={() => navigate('')}
            className="shrink-0 rounded px-1 text-[10.5px] text-ink-soft hover:bg-panel-muted hover:text-ink"
          >
            DVault (D:)
          </button>
          {segments.map((segment, index) => {
            const target = segments.slice(0, index + 1).join('/')
            const isLast = index === segments.length - 1
            return (
              <span key={target} className="flex min-w-0 items-center gap-0.5">
                <ChevronRight className="size-3 shrink-0 text-ink-faint/70" />
                <button
                  type="button"
                  onClick={() => navigate(target)}
                  className={cn(
                    'truncate rounded px-1 text-[10.5px] hover:bg-panel-muted',
                    isLast ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {segment}
                </button>
              </span>
            )
          })}
        </nav>

        <div className="flex items-center gap-1">
          <label className="relative hidden items-center sm:flex">
            <Search className="pointer-events-none absolute left-2 size-3 text-ink-faint" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this folder"
              aria-label="Search this folder"
              className="h-8 w-36 rounded-md border border-line bg-panel pl-7 pr-6 text-[10.5px] text-ink outline-none placeholder:text-ink-faint focus:border-gold/50 focus:ring-2 focus:ring-gold/10 lg:w-44"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1 flex size-4 items-center justify-center rounded text-ink-faint hover:text-ink"
              >
                <X className="size-2.5" />
              </button>
            )}
          </label>
          <Button
            variant={showPreview ? 'subtle' : 'ghost'}
            size="icon-sm"
            aria-label="Toggle preview pane"
            aria-pressed={showPreview}
            onClick={() => setShowPreview((current) => !current)}
            title="Preview pane"
          >
            <PanelRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[206px] shrink-0 flex-col border-r border-line bg-surface/60">
          <div className="px-3 pb-1 pt-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Quick access
            </p>
          </div>
          <nav className="px-2" aria-label="Quick access">
            <button
              type="button"
              onClick={() => navigate('')}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10.5px] transition-colors',
                path === ''
                  ? 'bg-gold-soft/70 font-medium text-ink ring-1 ring-inset ring-gold/20'
                  : 'text-ink-soft hover:bg-panel-muted',
              )}
            >
              <HardDrive className="size-3.5 text-gold-ink/70" />
              <span className="flex-1 truncate">Vault (D:)</span>
            </button>
            {parentFolders.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => navigate(entry.folder ?? '')}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10.5px] transition-colors',
                  path === entry.folder
                    ? 'bg-gold-soft/70 font-medium text-ink ring-1 ring-inset ring-gold/20'
                    : 'text-ink-soft hover:bg-panel-muted',
                )}
              >
                <Folder className="size-3.5 text-gold-ink/60" />
                <span className="flex-1 truncate">{entry.name}</span>
                <span className="text-[9px] text-ink-faint tnum">{entry.children?.length ?? 0}</span>
              </button>
            ))}
          </nav>

          <div className="mt-4 border-t border-line px-3 pb-1 pt-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              This PC
            </p>
          </div>
          <div className="px-3">
            <div className="flex items-center gap-2 py-1.5 text-[10.5px] text-ink-soft">
              <HardDrive className="size-3.5 text-ink-faint" />
              DVault (D:)
            </div>
            <Progress value={7} tone="gold" className="mt-1 h-1" label="Drive usage" />
            <p className="mt-1 text-[9px] text-ink-faint tnum">
              {formatFileSize(totalBytesKb)} of documents · 59.9 GB free
            </p>
          </div>

          <div className="mt-4 border-t border-line px-3 pb-1 pt-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Vault shortcuts
            </p>
          </div>
          <div className="space-y-0.5 px-2">
            <button
              type="button"
              onClick={() => showApp('vault', { section: 'vault' })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10.5px] text-ink-soft transition-colors hover:bg-panel-muted"
            >
              <LockKeyhole className="size-3.5 text-gold-ink/70" />
              <span className="flex-1">Sealed records</span>
              <span className="text-[9px] text-ink-faint tnum">{data.documents.length}</span>
            </button>
            <button
              type="button"
              onClick={() => showApp('vault', { section: 'overview' })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10.5px] text-ink-soft transition-colors hover:bg-panel-muted"
            >
              <ShieldCheck className="size-3.5 text-gold-ink/70" />
              <span className="flex-1">Governance status</span>
            </button>
          </div>

          <div className="mt-auto border-t border-line p-3">
            <p className="rounded-md border border-line bg-panel px-2 py-1.5 text-[9px] leading-4 text-ink-faint">
              DVault demo drive · synthetic identities only
            </p>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="scroll-thin min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-panel/95 backdrop-blur">
                <tr className="border-b border-line text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  <th className="px-3 py-2 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-ink"
                    >
                      Name
                      <ArrowUpDown className={cn('size-2.5', sort.key === 'name' && 'text-gold')} />
                    </button>
                  </th>
                  <th className="w-[104px] px-2 py-2 font-semibold">
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
                  <th className="w-[112px] px-2 py-2 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('type')}
                      className="inline-flex items-center gap-1 hover:text-ink"
                    >
                      Type
                      <ArrowUpDown className={cn('size-2.5', sort.key === 'type' && 'text-gold')} />
                    </button>
                  </th>
                  <th className="w-[72px] px-2 py-2 text-right font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('size')}
                      className="inline-flex items-center gap-1 hover:text-ink"
                    >
                      Size
                      <ArrowUpDown className={cn('size-2.5', sort.key === 'size' && 'text-gold')} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {entries.map((entry) => {
                  const active = entry.id === selectedId
                  const document = entry.documentId
                    ? data.documents.find((record) => record.id === entry.documentId)
                    : undefined
                  return (
                    <tr
                      key={entry.id}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => setSelectedId(entry.id)}
                      onDoubleClick={() => openEntry(entry)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          openEntry(entry)
                        }
                        if (event.key === ' ') {
                          event.preventDefault()
                          setSelectedId(entry.id)
                        }
                      }}
                      className={cn(
                        'cursor-default select-none text-[11px] outline-none transition-colors',
                        active
                          ? 'bg-gold-soft/40 shadow-[inset_2px_0_0_0_#B7892F]'
                          : 'hover:bg-panel-muted/40 focus-visible:bg-panel-muted/50',
                      )}
                    >
                      <td className="px-3 py-[7px]">
                        <div className="flex items-center gap-2">
                          {entry.kind === 'folder' ? (
                            <FolderOpen className="size-4 shrink-0 text-gold-ink/75" strokeWidth={1.7} />
                          ) : document ? (
                            <DocumentIcon kind={document.kind} className="size-7" />
                          ) : (
                            <Folder className="size-4 text-ink-faint" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{entry.name}</p>
                            {document && (
                              <p className="mt-0.5 flex items-center gap-1.5 text-[9px] text-ink-faint">
                                <span className="capitalize">{document.sensitivity}</span>
                                <span className="size-0.5 rounded-full bg-ink-faint" />
                                <span>{formatFileSize(document.sizeKb)}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-[7px] text-[10px] text-ink-faint tnum">
                        {formatDate(entry.modifiedAt)}
                      </td>
                      <td className="truncate px-2 py-[7px] text-[10px] text-ink-soft">
                        {entry.typeLabel}
                      </td>
                      <td className="px-2 py-[7px] text-right text-[10px] text-ink-faint tnum">
                        {entry.kind === 'folder' ? '—' : formatFileSize(entry.sizeKb ?? 0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {entries.length === 0 && (
              <StateBlock
                icon={FolderOpen}
                title={search ? 'No items match your search' : 'This folder is empty'}
                description={
                  search
                    ? 'Clear the search to see everything in this folder.'
                    : 'Nothing has been filed here in the synthetic drive.'
                }
              >
                {search && (
                  <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                )}
              </StateBlock>
            )}
          </div>

          <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-line bg-surface px-3 text-[9.5px] text-ink-faint">
            <span>
              {entries.length} item{entries.length === 1 ? '' : 's'}
            </span>
            <span className="h-3 w-px bg-line" />
            <span>
              {selected
                ? `${selected.name}${selected.sizeKb ? ` · ${formatFileSize(selected.sizeKb)}` : ''}`
                : 'Nothing selected'}
            </span>
            <span className="ml-auto">
              {path ? `DVault (D:) › ${segments.join(' › ')}` : 'DVault (D:)'}
            </span>
          </footer>
        </main>

        {showPreview && (
          <aside className="w-[300px] shrink-0 border-l border-line bg-panel">
            {selectedDocument ? (
              <FilePreview
                document={selectedDocument}
                onOpenVault={() =>
                  showApp('vault', { section: 'vault', documentId: selectedDocument.id })
                }
                onOpenDataExplorer={() =>
                  showApp('vault', { section: 'records', documentId: selectedDocument.id })
                }
              />
            ) : (
              <PreviewPlaceholder
                title={
                  selected?.kind === 'folder' ? selected.name : path ? segments.at(-1) ?? 'DVault' : 'DVault (D:)'
                }
                description={
                  selected?.kind === 'folder'
                    ? `${selected.children?.length ?? 0} items · folder updated ${formatDate(selected.modifiedAt)}`
                    : search
                      ? `${entries.length} matching items in this folder`
                      : `${entries.length} items in this folder`
                }
                modified={selected?.modifiedAt ?? folder.modifiedAt}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

function FilePreview({
  document,
  onOpenVault,
  onOpenDataExplorer,
}: {
  document: DocumentRecord
  onOpenVault: () => void
  onOpenDataExplorer: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line px-4 pb-3 pt-4">
        <DocumentIcon kind={document.kind} className="size-10" />
        <p className="mt-2.5 break-words text-[12px] font-semibold leading-[1.35] text-ink">
          {document.name}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge tone={sensitivityTone[document.sensitivity]} className="capitalize">
            {document.sensitivity}
          </Badge>
          <Badge tone={importTone[document.importState]}>
            {importLabels[document.importState]}
          </Badge>
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p className="rounded-md border border-line bg-surface px-2.5 py-2 text-[10px] leading-5 text-ink-soft">
          {document.snippet}
        </p>
        <dl className="space-y-1.5 text-[10px]">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-faint">Kind</dt>
            <dd className="text-ink-soft">{document.kind}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-faint">Modified</dt>
            <dd className="text-ink-soft tnum">{formatDateTime(document.modifiedAt)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-faint">Size</dt>
            <dd className="text-ink-soft tnum">{formatFileSize(document.sizeKb)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-faint">Confidence</dt>
            <dd className="text-ink-soft tnum">
              {Math.round(document.confidence * 100)}%
            </dd>
          </div>
        </dl>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Detected fields
          </p>
          <ul className="mt-1.5 space-y-1 text-[9.5px]">
            {document.fields.slice(0, 4).map((field) => (
              <li key={field.field} className="flex items-center justify-between gap-2">
                <span className="truncate text-ink-soft">{field.field}</span>
                <span className="shrink-0 text-ink-faint tnum">
                  {Math.round(field.confidence * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="shrink-0 space-y-1.5 border-t border-line p-3">
        <Button variant="gold" size="sm" className="w-full" onClick={onOpenVault}>
          <LockKeyhole className="size-3.5" /> Open in Vault
        </Button>
        <Button variant="outline" size="sm" className="w-full" onClick={onOpenDataExplorer}>
          Inspect classification
        </Button>
      </div>
    </div>
  )
}

function PreviewPlaceholder({
  title,
  description,
  modified,
}: {
  title: string
  description: string
  modified: string
}) {
  return (
    <div className="flex h-full flex-col p-4">
      <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface text-gold-ink/70">
        <FolderOpen className="size-5" />
      </span>
      <p className="mt-2.5 text-[12px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[10px] leading-4 text-ink-faint">{description}</p>
      <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-[10px]">
        <div className="flex justify-between">
          <span className="text-ink-faint">Modified</span>
          <span className="text-ink-soft tnum">{formatDate(modified)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-faint">Location</span>
          <span className="text-ink-soft">DVault (D:)</span>
        </div>
      </div>
      <p className="mt-auto rounded-md border border-line bg-surface px-2 py-1.5 text-[9px] leading-4 text-ink-faint">
        Double-click a record to open it in the Vault. Folders open in place.
      </p>
    </div>
  )
}

function ExplorerSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center gap-2 border-b border-line bg-surface px-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[206px] space-y-2 border-r border-line p-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
        <div className="flex-1 space-y-2 p-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
