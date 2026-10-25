import { FileQuestion, Mail, MessageSquare, Receipt, ShieldCheck, Table2 } from 'lucide-react'
import type { DocumentPreview as Preview, DocumentRecord, PreviewField, PreviewMessage } from '@/domain/types'
import { Badge } from '@/components/ui/badge'
import { StateBlock } from '@/components/ui/state-block'
import { cn } from '@/lib/cn'

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

function formatMoney(value: number | null | undefined) {
  return typeof value === 'number' ? money.format(value) : '—'
}

function FieldGrid({ fields }: { fields?: PreviewField[] }) {
  if (!fields?.length) return null
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {fields.map((field) => (
        <div key={`${field.label}-${field.value}`} className="min-w-0 rounded-md border border-line bg-surface px-2 py-1.5">
          <dt className="text-[8px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            {field.label}
          </dt>
          <dd className="mt-0.5 break-words text-[10px] text-ink">{field.value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

function LineItems({ preview }: { preview: Preview }) {
  if (!preview.line_items?.length) return null
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full border-collapse text-left">
        <thead className="bg-panel-muted text-[8px] uppercase tracking-[0.1em] text-ink-faint">
          <tr>
            <th className="px-2 py-1.5">Description</th>
            <th className="px-2 py-1.5 text-right">Qty</th>
            <th className="px-2 py-1.5 text-right">Unit price</th>
            <th className="px-2 py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {preview.line_items.map((item, index) => (
            <tr key={`${item.description}-${index}`} className="border-t border-line/70 text-[10px]">
              <td className="px-2 py-1.5 text-ink">{item.description}</td>
              <td className="px-2 py-1.5 text-right tnum text-ink-soft">{item.quantity}</td>
              <td className="px-2 py-1.5 text-right tnum text-ink-soft">{formatMoney(item.unit_price)}</td>
              <td className="px-2 py-1.5 text-right tnum text-ink">{formatMoney(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview.totals && Object.keys(preview.totals).length > 0 && (
        <div className="border-t border-line bg-surface px-2 py-1.5">
          {Object.entries(preview.totals).map(([label, value]) => (
            <div key={label} className="flex justify-between text-[10px] text-ink-soft">
              <span className="capitalize">{label}</span>
              <span className="font-semibold text-ink tnum">{formatMoney(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MessageList({ messages, email }: { messages?: PreviewMessage[]; email?: boolean }) {
  if (!messages?.length) return null
  return (
    <div className="space-y-2">
      {messages.map((message, index) => {
        const outbound = message.direction === 'outbound'
        return (
          <article
            key={`${message.sent_at ?? index}-${index}`}
            className={cn(
              'rounded-lg border px-2.5 py-2',
              outbound
                ? 'border-gold/20 bg-gold-soft/35'
                : 'border-line bg-surface',
            )}
          >
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-[9.5px] font-semibold text-ink">
                {message.from || message.sender || (outbound ? 'Aranya Coaching' : 'Contact')}
              </span>
              <Badge tone={outbound ? 'gold' : 'neutral'}>
                {outbound ? 'outbound' : 'inbound'}
              </Badge>
              <span className="ml-auto text-[8.5px] text-ink-faint">
                {message.sent_at || message.subject || ''}
              </span>
            </div>
            {email && message.subject && (
              <p className="mt-0.5 text-[9px] font-medium text-ink-soft">{message.subject}</p>
            )}
            <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-ink-soft">
              {message.body}
            </p>
          </article>
        )
      })}
    </div>
  )
}

function TablePreview({ preview }: { preview: Preview }) {
  const columns = preview.columns ?? []
  const rows = preview.rows ?? []
  if (!columns.length) return <StateBlock title="No table schema" description="The source table has not been profiled." />
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[9px] text-ink-faint">
        <Table2 className="size-3.5" />
        {preview.row_count ?? rows.length} rows · showing {rows.length}
        {preview.truncated && <Badge tone="warning">truncated</Badge>}
      </div>
      <div className="max-h-[360px] overflow-auto rounded-md border border-line">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-panel-muted">
            <tr className="text-[8px] uppercase tracking-[0.1em] text-ink-faint">
              {columns.map((column) => (
                <th key={column.key} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-line/70 text-[9.5px] text-ink-soft">
                {columns.map((column) => (
                  <td key={column.key} className="px-2 py-1.5">
                    {row[column.key] || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function DocumentPreview({ document }: { document: DocumentRecord }) {
  const preview = document.preview
  if (!preview) {
    return (
      <StateBlock
        icon={FileQuestion}
        title="No structured preview"
        description="This record was catalogued without a content preview. Start FastAPI and re-ingest the fixture to render it naturally."
      />
    )
  }

  if (preview.kind === 'invoice' || preview.kind === 'purchase-order') {
    const invoice = preview.kind === 'invoice'
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 rounded-md border border-line bg-panel-muted px-2.5 py-2">
          {invoice ? <Receipt className="size-4 text-gold-ink" /> : <Receipt className="size-4 text-gold-ink" />}
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              {invoice ? 'Invoice' : 'Purchase order'}
            </p>
            <p className="text-[11px] font-semibold text-ink">{preview.reference ?? 'Unnumbered'}</p>
          </div>
          {preview.status && <Badge tone="success" className="ml-auto">{preview.status}</Badge>}
        </div>
        <FieldGrid fields={preview.fields} />
        <LineItems preview={preview} />
      </div>
    )
  }

  if (preview.kind === 'email-thread') {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-ink">
          <Mail className="size-3.5 text-gold-ink" />
          {preview.reference ?? 'Email thread'}
        </div>
        <MessageList messages={preview.messages} email />
      </div>
    )
  }

  if (preview.kind === 'conversation') {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-ink">
          <MessageSquare className="size-3.5 text-gold-ink" />
          Conversation · {preview.messages?.length ?? 0} messages
        </div>
        <MessageList messages={preview.messages} />
      </div>
    )
  }

  if (preview.kind === 'consent-record') {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 rounded-md border border-success/25 bg-success-soft/60 px-2.5 py-2">
          <ShieldCheck className="size-4 text-success" />
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#2f6b4f]">
              Consent record
            </p>
            <p className="text-[11px] font-semibold text-ink">{preview.reference ?? 'Authorization'}</p>
          </div>
          {preview.consent?.status ? (
            <Badge tone="success" className="ml-auto capitalize">
              {String(preview.consent.status)}
            </Badge>
          ) : null}
        </div>
        <FieldGrid fields={preview.fields} />
      </div>
    )
  }

  if (preview.kind === 'table') {
    return <TablePreview preview={preview} />
  }

  return (
    <div className="space-y-2.5">
      <FieldGrid fields={preview.fields} />
      {preview.body && (
        <p className="whitespace-pre-wrap rounded-md border border-line bg-surface px-2.5 py-2 text-[10px] leading-4 text-ink-soft">
          {preview.body}
        </p>
      )}
      {!preview.fields?.length && !preview.body && (
        <StateBlock title="Nothing to preview" description="This document contains metadata only." />
      )}
    </div>
  )
}
