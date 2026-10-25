import { HardDrive, MessageSquare, ReceiptText, ShieldCheck } from 'lucide-react'
import type { UserWorkspace } from '@/domain/user'
import { selectUserSourceCounts, selectUserSummary } from '@/data/user-selectors'
import { userSourceTone } from '@/lib/user-meta'
import { formatDate, formatRelative } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PhoneAppShell } from './PhoneChrome'

const icons = {
  storage: HardDrive,
  billing: ReceiptText,
  messaging: MessageSquare,
  forms: ShieldCheck,
  crm: HardDrive,
}

export function PhoneSourcesApp({
  workspace,
  onBack,
  onOpenData,
}: {
  workspace: UserWorkspace
  onBack: () => void
  onOpenData: () => void
}) {
  const counts = selectUserSourceCounts(workspace)
  const summary = selectUserSummary(workspace)

  return (
    <PhoneAppShell title="Sources" onBack={onBack}>
      <div className="space-y-3 p-4">
        <div className="rounded-2xl border border-line bg-panel p-3.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Linked to you
          </p>
          <p className="mt-1 text-[20px] font-semibold leading-none text-ink tnum">
            {summary.sources}
            <span className="ml-1 text-[9px] font-normal text-ink-faint">sources</span>
          </p>
          <p className="mt-1.5 text-[8.5px] leading-3.5 text-ink-faint">
            Each source holds a specific purpose and retention period. Open a record to see the
            details.
          </p>
        </div>

        {workspace.sources.map((source) => {
          const Icon = icons[source.category]
          return (
            <div
              key={source.id}
              className="rounded-2xl border border-line bg-panel p-3.5 shadow-sm"
            >
              <div className="flex items-start gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft">
                  <Icon className="size-3.5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[10.5px] font-semibold text-ink">{source.name}</p>
                    <Badge tone={userSourceTone[source.status]} dot>
                      {source.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[8.5px] text-ink-faint">{source.provider}</p>
                  <p className="mt-1 text-[9px] leading-3.5 text-ink-soft">{source.purpose}</p>
                  <div className="mt-2 flex items-center justify-between text-[8px] text-ink-faint">
                    <span>{counts.get(source.id) ?? 0} records</span>
                    <span>
                      synced {formatRelative(source.lastSync)} · {formatDate(source.lastSync)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        <Button variant="gold" size="sm" className="w-full" onClick={onOpenData}>
          View all records
        </Button>
        <p className="text-[8px] leading-3.5 text-ink-faint">{workspace.notice}</p>
      </div>
    </PhoneAppShell>
  )
}
