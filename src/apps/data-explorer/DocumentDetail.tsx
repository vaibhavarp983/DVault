import {
  CheckCircle2,
  FolderOpen,
  LockKeyhole,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { DemoData, DocumentRecord } from '@/domain/types'
import { documentTypeLabel, sourceNameFor } from '@/data/selectors'
import {
  fieldCategoryTone,
  importLabels,
  importTone,
  reviewLabels,
  reviewTone,
  sensitivityTone,
} from '@/lib/document-meta'
import { formatDate, formatDateTime, formatFileSize, initials } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Progress } from '@/components/ui/progress'
import { SectionLabel } from '@/components/ui/panel'

type DetailTab = 'overview' | 'fields' | 'schema'

export function DocumentDetail({
  document,
  data,
  onClose,
  onFilterCustomer,
  onOpenVault,
  onOpenExplorer,
  onOpenControlCenter,
}: {
  document: DocumentRecord
  data: DemoData
  onClose: () => void
  onFilterCustomer: (customerId: string) => void
  onOpenVault: () => void
  onOpenExplorer: () => void
  onOpenControlCenter: () => void
}) {
  const { markReviewed } = useDemo()
  const [tab, setTab] = useState<DetailTab>('overview')
  const [approving, setApproving] = useState(false)

  const customer = data.customers.find((entry) => entry.id === document.customerId)
  const source = data.sources.find((entry) => entry.id === document.sourceId)
  const lowConfidence = document.fields.filter((field) => field.confidence < 0.8)
  const missing = document.missing ?? []
  const hasConcerns = missing.length > 0 || lowConfidence.length > 0

  const approve = async () => {
    setApproving(true)
    try {
      await markReviewed(document.id)
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line px-4 pb-3 pt-3.5">
        <div className="flex items-start gap-2.5">
          <DocumentIcon kind={document.kind} className="size-9" />
          <div className="min-w-0 flex-1">
            <p className="break-words text-[12.5px] font-semibold leading-[1.35] text-ink">
              {document.name}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Badge tone={sensitivityTone[document.sensitivity]} className="capitalize">
                {document.sensitivity}
              </Badge>
              <Badge tone={importTone[document.importState]}>
                {importLabels[document.importState]}
              </Badge>
              <Badge tone={reviewTone[document.reviewStatus]}>
                {reviewLabels[document.reviewStatus]}
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close record details"
            onClick={onClose}
            className="-mr-1 -mt-1"
          >
            <X className="size-3.5" />
          </Button>
        </div>
        <p className="mt-2.5 rounded-md border border-line bg-surface px-2.5 py-2 text-[10.5px] leading-4 text-ink-soft">
          {document.snippet}
        </p>
      </header>

      <div role="tablist" aria-label="Record details" className="flex shrink-0 border-b border-line px-2">
        {(
          [
            ['overview', 'Overview'],
            ['fields', `Detected fields · ${document.fields.length}`],
            ['schema', 'Schema'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'relative px-2.5 py-2 text-[10.5px] font-medium transition-colors',
              tab === value ? 'text-ink' : 'text-ink-faint hover:text-ink-soft',
            )}
          >
            {label}
            {tab === value && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" />
            )}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4"
        aria-label={`${tab} details`}
      >
        {tab === 'overview' && (
          <div className="space-y-4">
            <div>
              <SectionLabel>Record metadata</SectionLabel>
              <dl className="mt-2 space-y-1.5 text-[10.5px]">
                <MetaRow label="Type" value={documentTypeLabel(document.kind)} />
                <MetaRow label="Source" value={source?.name ?? 'Unknown'} />
                <MetaRow label="Customer" value={customer?.company ?? 'Unlinked record'} />
                <MetaRow label="Created" value={formatDate(document.createdAt)} />
                <MetaRow label="Modified" value={formatDateTime(document.modifiedAt)} />
                <MetaRow label="Size" value={formatFileSize(document.sizeKb)} />
                <MetaRow
                  label="Confidence"
                  value={`${Math.round(document.confidence * 100)}%`}
                />
              </dl>
            </div>

            {customer && (
              <div className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-gold-soft text-[10px] font-semibold text-gold-ink">
                    {initials(customer.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-ink">{customer.company}</p>
                    <p className="truncate text-[10px] text-ink-faint">
                      {customer.name} · {customer.location}
                    </p>
                  </div>
                  {customer.status === 'at-risk' && (
                    <Badge tone="warning">At risk</Badge>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onFilterCustomer(customer.id)}
                  className="mt-2.5 w-full rounded-md border border-line bg-panel py-1.5 text-[10px] font-medium text-ink-soft transition-colors hover:border-gold/40 hover:text-ink"
                >
                  Show all records for this customer
                </button>
              </div>
            )}

            <div>
              <SectionLabel>Tags</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-1">
                {document.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-line bg-panel px-1.5 py-0.5 text-[9.5px] text-ink-soft"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={onOpenVault}>
                <LockKeyhole className="size-3.5" /> Open in Vault
              </Button>
              <Button variant="outline" size="sm" onClick={onOpenExplorer}>
                <FolderOpen className="size-3.5" /> File Explorer
              </Button>
            </div>
          </div>
        )}

        {tab === 'fields' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Detected fields</SectionLabel>
              <span className="text-[9.5px] text-ink-faint">
                {lowConfidence.length} below threshold
              </span>
            </div>
            <ul className="space-y-2">
              {document.fields.map((field) => (
                <li
                  key={field.field}
                  className="rounded-lg border border-line bg-surface px-2.5 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-ink">
                      {field.field}
                    </span>
                    <Badge tone={fieldCategoryTone[field.category]}>{field.category}</Badge>
                    <span
                      className={cn(
                        'w-7 text-right text-[9.5px] tnum',
                        field.confidence < 0.8 ? 'font-medium text-warning' : 'text-ink-faint',
                      )}
                    >
                      {Math.round(field.confidence * 100)}%
                    </span>
                  </div>
                  <Progress
                    value={field.confidence * 100}
                    tone={field.confidence < 0.8 ? 'warning' : 'gold'}
                    className="mt-1.5 h-1"
                    label={`${field.field} confidence`}
                  />
                  {field.note && (
                    <p className="mt-1.5 text-[9.5px] leading-4 text-ink-faint">{field.note}</p>
                  )}
                </li>
              ))}
            </ul>

            {hasConcerns && (
              <div className="rounded-lg border border-warning/25 bg-warning-soft/60 p-2.5">
                <p className="flex items-center gap-1.5 text-[10.5px] font-medium text-warning">
                  <TriangleAlert className="size-3.5" /> Needs a human check
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[9.5px] leading-4 text-ink-soft">
                  {missing.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                  {lowConfidence.map((field) => (
                    <li key={field.field}>
                      {field.field} detected with {Math.round(field.confidence * 100)}% confidence
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === 'schema' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Inferred schema</SectionLabel>
              <Badge tone="gold">Preview</Badge>
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              <div className="grid grid-cols-[minmax(0,1.15fr)_54px_minmax(0,1fr)] gap-2 bg-panel-muted/70 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                <span>Field</span>
                <span>Type</span>
                <span>Example</span>
              </div>
              {document.schema.map((entry) => (
                <div
                  key={entry.field}
                  className="grid grid-cols-[minmax(0,1.15fr)_54px_minmax(0,1fr)] items-center gap-2 border-t border-line/80 px-2.5 py-1.5 text-[9.5px]"
                >
                  <span className="truncate font-medium text-ink">{entry.field}</span>
                  <span className="truncate font-mono text-[9px] text-gold-ink">{entry.type}</span>
                  <span className="truncate font-mono text-[9px] text-ink-faint">
                    {entry.example}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <p className="text-[10px] font-medium text-ink">How this preview is built</p>
              <p className="mt-1 text-[9.5px] leading-4 text-ink-faint">
                The schema is inferred from {document.fields.length} detected fields at{' '}
                {Math.round(document.confidence * 100)}% mean confidence. It is a preview only;
                nothing is written back to {source?.name ?? 'the source'}.
              </p>
            </div>

            {missing.length > 0 && (
              <div className="rounded-lg border border-warning/25 bg-warning-soft/60 px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-[10px] font-medium text-warning">
                  <TriangleAlert className="size-3" /> Fields expected but not found
                </p>
                <ul className="mt-1 space-y-0.5 text-[9.5px] leading-4 text-ink-soft">
                  {missing.map((entry) => (
                    <li key={entry}>· {entry}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="shrink-0 space-y-2 border-t border-line bg-surface px-3 py-2.5">
        {document.reviewStatus === 'needs-review' && (
          <Button
            variant="gold"
            size="sm"
            className="w-full"
            onClick={() => void approve()}
            disabled={approving}
          >
            {approving ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            {approving ? 'Approving…' : 'Approve classification'}
          </Button>
        )}

        {(document.importState === 'failed' || document.importState === 'missing') && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-warning/20 bg-warning-soft/50 px-2 py-1.5">
            <p className="text-[9.5px] leading-4 text-warning">
              Source sync is incomplete for this record.
            </p>
            <button
              type="button"
              onClick={onOpenControlCenter}
              className="shrink-0 text-[9.5px] font-medium text-gold-ink underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
            >
              Retry job
            </button>
          </div>
        )}

        <p className="flex items-center gap-1.5 text-[9.5px] text-ink-faint">
          <LockKeyhole className="size-3 text-gold" />
          Synthetic record · {sourceNameFor(data, document.sourceId)} · no real personal data
        </p>
      </footer>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="truncate text-right font-medium text-ink-soft">{value}</dd>
    </div>
  )
}
