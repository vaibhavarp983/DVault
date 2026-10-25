import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatusBanner } from './StatusBanner'

describe('StatusBanner', () => {
  it('shows the fail-closed state with the failure sequence and reason', () => {
    const html = renderToStaticMarkup(
      <StatusBanner
        integrity={{
          status: 'failed',
          evidenceState: 'UNTRUSTED',
          trustedThroughSequence: 3,
          failureSequence: 4,
          reasonCode: 'CHAIN_EVENT_EDITED',
          failures: [],
          gateState: 'BLOCKED',
          incidentId: 'incident-1',
          checkpointStatus: 'UNCHECKED',
          verifiedAt: '2026-10-25T08:00:00Z',
          disclaimer: 'Consistency only.',
          incidents: [],
          breachCounts: {},
        }}
      />,
    )

    expect(html).toContain('Evidence integrity blocked')
    expect(html).toContain('CHAIN_EVENT_EDITED')
    expect(html).toContain('Gate BLOCKED')
    expect(html).toContain('role="alert"')
  })

  it('shows the unverified state without claiming integrity', () => {
    const html = renderToStaticMarkup(<StatusBanner integrity={undefined} />)
    expect(html).toContain('not been connected')
  })
})
