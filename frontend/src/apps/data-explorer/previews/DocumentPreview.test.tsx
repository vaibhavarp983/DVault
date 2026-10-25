import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createSeedData } from '@/data/synthetic'
import type { DocumentRecord } from '@/domain/types'
import { DocumentPreview } from './DocumentPreview'

const base = createSeedData().documents[0]

function documentWith(preview: DocumentRecord['preview']): DocumentRecord {
  return { ...base, preview }
}

describe('DocumentPreview', () => {
  it('renders invoice line items, fields, and totals', () => {
    const html = renderToStaticMarkup(
      <DocumentPreview
        document={documentWith({
          kind: 'invoice',
          reference: 'INV-1007',
          status: 'Paid',
          fields: [{ label: 'Bill to', value: 'Aarav Mehta', classification: 'identity' }],
          line_items: [
            { description: 'Foundation Mathematics', quantity: 1, unit_price: 1200, amount: 1200 },
          ],
          totals: { total: 1200 },
        })}
      />,
    )

    expect(html).toContain('INV-1007')
    expect(html).toContain('Foundation Mathematics')
    expect(html).toContain('Aarav Mehta')
    expect(html).toContain('Paid')
  })

  it('renders a structured table preview', () => {
    const html = renderToStaticMarkup(
      <DocumentPreview
        document={documentWith({
          kind: 'table',
          columns: [
            { key: 'name', label: 'Name', type: 'string', classification: 'identity' },
            { key: 'email', label: 'Email', type: 'string', classification: 'contact' },
          ],
          rows: [{ name: 'Aarav', email: 'a***@example.test' }],
          row_count: 1,
        })}
      />,
    )

    expect(html).toContain('Name')
    expect(html).toContain('a***@example.test')
    expect(html).toContain('1 rows')
  })

  it('renders an email thread with direction badges', () => {
    const html = renderToStaticMarkup(
      <DocumentPreview
        document={documentWith({
          kind: 'email-thread',
          reference: 'Scholarship enquiry',
          messages: [
            { from: 'Aarav', to: 'Aranya', sent_at: '09:12', direction: 'inbound', body: 'Hello' },
            { from: 'Aranya', to: 'Aarav', sent_at: '14:00', direction: 'outbound', body: 'Thanks' },
          ],
        })}
      />,
    )

    expect(html).toContain('Scholarship enquiry')
    expect(html).toContain('inbound')
    expect(html).toContain('outbound')
  })

  it('explains when a record has no structured preview', () => {
    const html = renderToStaticMarkup(<DocumentPreview document={documentWith(undefined)} />)
    expect(html).toContain('No structured preview')
  })
})
