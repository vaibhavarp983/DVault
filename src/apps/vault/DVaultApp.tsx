import {
  ChevronRight,
  Database,
  LayoutDashboard,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { selectAuditIntegrity, selectGovernanceHealth } from '@/data/selectors'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import type { WindowPayload, WorkspaceSection } from '@/store/window-provider'
import { DVaultMark } from '@/components/ui/brand'
import { Progress } from '@/components/ui/progress'
import { ControlCenterApp } from '@/apps/control-center/ControlCenterApp'
import { DataExplorerApp } from '@/apps/data-explorer/DataExplorerApp'
import { VaultSection } from './VaultSection'

const sections: {
  id: WorkspaceSection
  label: string
  hint: string
  icon: typeof LayoutDashboard
}[] = [
  {
    id: 'overview',
    label: 'Overview',
    hint: 'Governance health & activity',
    icon: LayoutDashboard,
  },
  {
    id: 'records',
    label: 'Records',
    hint: 'Sources, files & classification',
    icon: Database,
  },
  {
    id: 'vault',
    label: 'Vault',
    hint: 'Sealed documents & collections',
    icon: LockKeyhole,
  },
]

export function DVaultApp({ payload }: { payload?: WindowPayload }) {
  const { data, mode, apiBaseUrl: configuredApiUrl } = useDemo()
  const [active, setActive] = useState<WorkspaceSection>(
    () => payload?.section ?? (payload?.documentId ? 'records' : 'overview'),
  )
  const [sectionPayload, setSectionPayload] = useState<WindowPayload | undefined>(payload)

  useEffect(() => {
    if (!payload) return
    if (payload.section) setActive(payload.section)
    else if (payload.documentId) setActive('records')
    setSectionPayload((current) => ({ ...current, ...payload }))
  }, [payload])

  const navigate = useCallback((section: WorkspaceSection, patch?: WindowPayload) => {
    setActive(section)
    setSectionPayload((current) => ({ ...current, ...patch, section }))
  }, [])

  const health = data ? selectGovernanceHealth(data) : undefined
  const integrity = data ? selectAuditIntegrity(data) : undefined
  const needsReview =
    data?.documents.filter((document) => document.reviewStatus === 'needs-review').length ?? 0
  const openRights =
    data?.rightsRequests.filter((request) => request.status !== 'complete').length ?? 0

  const counts: Record<WorkspaceSection, ReactNode> = {
    overview: health ? (
      <span className="rounded bg-gold/15 px-1 py-0.5 text-[9px] font-semibold text-gold-bright tnum">
        {health.score}
      </span>
    ) : null,
    records: needsReview > 0 ? (
      <span className="rounded bg-warning/20 px-1 py-0.5 text-[9px] font-semibold text-[#e7b45f] tnum">
        {needsReview}
      </span>
    ) : null,
    vault: data ? <span className="text-[9px] text-white/25 tnum">{data.documents.length}</span> : null,
  }

  return (
    <div className="flex h-full min-h-0 bg-[#171512] text-white">
      <aside className="flex w-[218px] shrink-0 flex-col border-r border-white/[0.07] bg-[#191713]">
        <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4 py-4">
          <DVaultMark className="size-8" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold tracking-tight text-white">DVault</span>
              <span className="rounded border border-gold/25 bg-gold/10 px-1 py-0.5 text-[7.5px] font-semibold uppercase tracking-[0.14em] text-gold-bright">
                Demo
              </span>
            </div>
            <p className="mt-0.5 truncate text-[8.5px] uppercase tracking-[0.14em] text-white/28">
              Governance workspace
            </p>
          </div>
        </div>

        <nav className="px-2 py-3" aria-label="DVault workspace">
          <p className="px-2 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/25">
            Workspace
          </p>
          {sections.map((section) => {
            const Icon = section.icon
            const isActive = active === section.id
            return (
              <button
                key={section.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => navigate(section.id)}
                className={cn(
                  'group relative mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                  isActive
                    ? 'bg-white/[0.065] text-white ring-1 ring-inset ring-gold/15'
                    : 'text-white/55 hover:bg-white/[0.04] hover:text-white/80',
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gold" />
                )}
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md transition-colors',
                    isActive
                      ? 'bg-gold/15 text-gold-bright'
                      : 'bg-white/[0.035] text-white/35 group-hover:text-white/60',
                  )}
                >
                  <Icon className="size-3.5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium">{section.label}</span>
                  <span className="mt-0.5 block truncate text-[8.5px] leading-3 text-white/25">
                    {section.hint}
                  </span>
                </span>
                {counts[section.id]}
              </button>
            )
          })}
        </nav>

        <div className="mx-3 mt-1 rounded-lg border border-white/[0.07] bg-white/[0.025] p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25">
              Governance
            </span>
            <span className="text-[15px] font-semibold leading-none text-white/85 tnum">
              {health?.score ?? '—'}
              <span className="text-[8px] font-normal text-white/25">/100</span>
            </span>
          </div>
          <Progress
            value={health?.score ?? 0}
            tone="gold"
            className="mt-2 h-1 bg-white/10"
            label="Governance health"
          />
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.06] pt-2 text-[8.5px] text-white/35">
            <ShieldCheck
              className={cn('size-3 shrink-0', integrity?.valid ? 'text-gold-bright' : 'text-danger')}
            />
            {integrity?.valid ? 'Audit chain verified' : 'Audit chain unavailable'}
            <ChevronRight className="ml-auto size-3 shrink-0 text-white/15" />
          </div>
          <p className="mt-1 text-[8.5px] leading-3.5 text-white/20">
            {openRights} open rights request{openRights === 1 ? '' : 's'}
          </p>
        </div>

        <div className="mt-auto border-t border-white/[0.07] px-3 py-3">
          <div
            className="flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1.5"
            title={
              mode === 'api'
                ? `Connected to ${configuredApiUrl ?? 'FastAPI'}`
                : 'Using the local synthetic fixture repository'
            }
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                mode === 'api' ? 'bg-info' : 'bg-success',
              )}
            />
            <span className="text-[8.5px] font-medium text-white/50">
              {mode === 'api' ? 'FastAPI repository' : 'Local synthetic data'}
            </span>
            <span className="ml-auto text-[8px] text-white/20">
              {mode === 'api' ? 'api' : 'demo'}
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[8.5px] text-white/22">
            <Sparkles className="size-2.5 text-gold/60" />
            {data
              ? `${data.documents.length} records · ${data.customers.length} customers`
              : 'Loading workspace…'}
          </p>
          <p className="mt-1 truncate text-[8px] leading-3 text-white/15" title={configuredApiUrl ?? undefined}>
            {mode === 'api'
              ? (configuredApiUrl ?? 'API mode')
              : 'No network calls · session only'}
          </p>
        </div>
      </aside>

      <div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
        <div
          className={cn(
            'absolute inset-0 flex min-h-0 flex-col',
            active !== 'overview' && 'pointer-events-none invisible',
          )}
          aria-hidden={active !== 'overview'}
          inert={active !== 'overview'}
        >
          <ControlCenterApp onNavigate={navigate} />
        </div>

        <div
          className={cn(
            'absolute inset-0 flex min-h-0 flex-col',
            active !== 'records' && 'pointer-events-none invisible',
          )}
          aria-hidden={active !== 'records'}
          inert={active !== 'records'}
        >
          <DataExplorerApp payload={sectionPayload} onNavigate={navigate} />
        </div>

        <div
          className={cn(
            'absolute inset-0 flex min-h-0 flex-col',
            active !== 'vault' && 'pointer-events-none invisible',
          )}
          aria-hidden={active !== 'vault'}
          inert={active !== 'vault'}
        >
          <VaultSection payload={sectionPayload} onNavigate={navigate} />
        </div>
      </div>
    </div>
  )
}
