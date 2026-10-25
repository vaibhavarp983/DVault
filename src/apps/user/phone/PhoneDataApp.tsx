import { CheckCircle2, FileSearch, LockKeyhole, Search, X } from 'lucide-react'
import { useState } from 'react'
import type { DocumentKind } from '@/domain/types'
import type { UserDocument, UserWorkspace } from '@/domain/user'
import {
  selectUserDocuments,
  selectUserSource,
  selectUserSourceCounts,
} from '@/data/user-selectors'
import {
  userDocumentKindLabel,
  userSensitivityTone,
} from '@/lib/user-meta'
import { formatDate, formatDateTime, formatFileSize } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useUser } from '@/store/user-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DocumentIcon } from '@/components/ui/document-icon'
import { SectionLabel } from '@/components/ui/panel'
import { PhoneAppShell } from './PhoneChrome'

const iconKind: Record<UserDocument['kind'], DocumentKind> = {
  account: 'crm-record',
  invoice: 'invoice',
  message: 'conversation',
  consent: 'consent-record',
  form: 'form',
  note: 'note',
  export: 'spreadsheet',
}

export function PhoneDataApp({
  workspace,
  onBack,
}: {
  workspace: UserWorkspace
  onBack: () => void
}) {
  const { createRequest } = useUser()
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [selected, setSelected] = useState<UserDocument | null>(null)
  const [requesting, setRequesting] = useState(false)

  const documents = selectUserDocuments(workspace, { search, sourceId: sourceFilter })
  const counts = selectUserSourceCounts(workspace)
  const hasOpenCopy = workspace.requests.some(
    (request) => request.type === 'portability' && request.status !== 'complete',
  )
  const selectedSource = selected
    ? selectUserSource(workspace, selected.sourceId)
    : undefined

  const requestCopy = async () => {
    if (!selected || hasOpenCopy || requesting) return
    setRequesting(true)
    try {
      const ok = await createRequest('portability')
      if (ok) setSelected(null)
    } finally {
      setRequesting(false)
    }
  }

  return (
    <PhoneAppShell
      title="My data"
      onBack={onBack}
      action={
        <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[9px] text-ink-faint tnum">
          {workspace.documents.length}
        </span>
      }
      overlay={
        selected ? (
          <div className="absolute inset-0 z-40 flex flex-col justify-end">
            <button
              type="button"
              aria-label="Close record details"
              className="absolute inset-0 bg-charcoal/40 backdrop-blur-[1px]"
              onClick={() => setSelected(null)}
            />
            <div className="scroll-thin relative max-h-[82%] overflow-y-auto rounded-t-[28px] border-t border-line bg-panel px-4 pb-7 pt-3 shadow-flyout">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
              <div className="flex items-start gap-2.5">
                <DocumentIcon kind={iconKind[selected.kind]} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[12px] font-semibold leading-4 text-ink">
                    {selected.name}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge tone={userSensitivityTone[selected.sensitivity]} className="capitalize">
                      {selected.sensitivity}
                    </Badge>
                    <Badge tone="neutral">{userDocumentKindLabel[selected.kind]}</Badge>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setSelected(null)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-panel-muted hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              <p className="mt-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-[9.5px] leading-4 text-ink-soft">
                {selected.summary}
              </p>

              <div className="mt-3 space-y-1.5 text-[9.5px]">
                <Row label="Source" value={selectedSource?.provider ?? 'Unknown'} />
                <Row label="Held since" value={selected.heldSince} />
                <Row label="Retention" value={selected.retention} />
                <Row label="Updated" value={formatDateTime(selected.updatedAt)} />
                <Row label="Size" value={formatFileSize(selected.sizeKb)} />
              </div>

              <SectionLabel className="mt-3">Detected fields</SectionLabel>
              <ul className="mt-1.5 space-y-1">
                {selected.fields.map((field) => (
                  <li
                    key={field.field}
                    className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-2 py-1.5"
                  >
                    <span className="truncate text-[9px] text-ink-soft">{field.field}</span>
                    <span className="shrink-0 text-[8.5px] text-ink-faint tnum">
                      {Math.round(field.confidence * 100)}%
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                variant="gold"
                size="sm"
                className="mt-4 w-full"
                onClick={() => void requestCopy()}
                disabled={hasOpenCopy || requesting}
              >
                <LockKeyhole className="size-3.5" />
                {requesting ? 'Submitting…' : hasOpenCopy ? 'Copy already requested' : 'Request a copy'}
              </Button>
              <p className="mt-1.5 text-center text-[8px] text-ink-faint">
                Creates a portability request you can track in Requests.
              </p>
            </div>
          </div>
        ) : null
      }
    >
      <div className="space-y-3 p-4">
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-faint" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your records"
            aria-label="Search your records"
            className="h-9 w-full rounded-xl border border-line-strong bg-panel pl-8 pr-8 text-[10.5px] text-ink outline-none placeholder:text-ink-faint/80 focus:border-gold/60 focus:ring-2 focus:ring-gold/10"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 flex size-5 items-center justify-center rounded-full text-ink-faint hover:bg-panel-muted"
            >
              <X className="size-3" />
            </button>
          )}
        </label>

        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          <FilterChip
            label="All"
            count={workspace.documents.length}
            active={sourceFilter === 'all'}
            onClick={() => setSourceFilter('all')}
          />
          {workspace.sources.map((source) => (
            <FilterChip
              key={source.id}
              label={source.name}
              count={counts.get(source.id) ?? 0}
              active={sourceFilter === source.id}
              onClick={() =>
                setSourceFilter((current) => (current === source.id ? 'all' : source.id))
              }
            />
          ))}
        </div>

        <div className="space-y-1.5">
          {documents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-panel px-4 py-8 text-center">
              <FileSearch className="mx-auto size-5 text-ink-faint" />
              <p className="mt-2 text-[10.5px] font-medium text-ink">No records match</p>
              <p className="mt-1 text-[9px] text-ink-faint">Try another source or search.</p>
            </div>
          ) : (
            documents.map((document) => {
              const source = workspace.sources.find(
                (entry) => entry.id === document.sourceId,
              )
              return (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => setSelected(document)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-panel px-2.5 py-2 text-left shadow-sm transition-colors active:bg-panel-muted"
                >
                  <DocumentIcon kind={iconKind[document.kind]} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10.5px] font-medium text-ink">
                      {document.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[8.5px] text-ink-faint">
                      {source?.name} · {formatDate(document.updatedAt)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      document.sensitivity === 'restricted'
                        ? 'bg-danger'
                        : document.sensitivity === 'confidential'
                          ? 'bg-warning'
                          : 'bg-ink-faint/50',
                    )}
                    title={document.sensitivity}
                  />
                </button>
              )
            })
          )}
        </div>

        <p className="flex items-start gap-1.5 pt-1 text-[8px] leading-3.5 text-ink-faint">
          <CheckCircle2 className="mt-0.5 size-2.5 shrink-0 text-success" />
          {workspace.notice}
        </p>
      </div>
    </PhoneAppShell>
  )
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] transition-colors',
        active
          ? 'border-gold/40 bg-gold-soft text-gold-ink'
          : 'border-line bg-panel text-ink-soft',
      )}
    >
      {label}
      <span className={cn('tnum', active ? 'text-gold-ink/60' : 'text-ink-faint')}>{count}</span>
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-ink-faint">{label}</span>
      <span className="text-right font-medium text-ink-soft">{value}</span>
    </div>
  )
}
