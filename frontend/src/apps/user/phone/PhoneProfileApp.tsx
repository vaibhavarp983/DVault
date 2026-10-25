import {
  Building2,
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import type { UserWorkspace } from '@/domain/user'
import { selectUserSummary } from '@/data/user-selectors'
import { formatDate, initials } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useUser } from '@/store/user-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PhoneAppShell } from './PhoneChrome'

export function PhoneProfileApp({
  workspace,
  onBack,
  onOpenBusiness,
}: {
  workspace: UserWorkspace
  onBack: () => void
  onOpenBusiness: () => void
}) {
  const { mode, apiBaseUrl, reset } = useUser()
  const [resetting, setResetting] = useState(false)
  const summary = selectUserSummary(workspace)

  const restore = async () => {
    setResetting(true)
    try {
      await reset()
    } finally {
      setResetting(false)
    }
  }

  return (
    <PhoneAppShell title="Profile" onBack={onBack}>
      <div className="space-y-3 p-4">
        <div className="rounded-2xl border border-line bg-panel p-4 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full border border-gold/20 bg-gold-soft text-[16px] font-semibold text-gold-ink">
            {initials(workspace.profile.name)}
          </span>
          <p className="mt-2 text-[14px] font-semibold text-ink">{workspace.profile.name}</p>
          <p className="mt-0.5 text-[9px] text-ink-faint">{workspace.profile.email}</p>
          <div className="mt-2 flex justify-center">
            <Badge tone="gold">Synthetic identity</Badge>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-3.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Contact details
          </p>
          <ul className="mt-2 space-y-2">
            <ProfileRow icon={Mail} label="Email" value={workspace.profile.email} />
            <ProfileRow icon={Phone} label="Phone" value={workspace.profile.phone} />
            <ProfileRow icon={MapPin} label="Location" value={workspace.profile.location} />
          </ul>
          <p className="mt-2.5 border-t border-line pt-2 text-[8px] text-ink-faint">
            Member since {formatDate(workspace.profile.memberSince)}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Data footprint
            </p>
            <ShieldCheck className="size-3.5 text-gold" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Stat label="records" value={summary.records} />
            <Stat label="sources" value={summary.sources} />
            <Stat label="open requests" value={summary.openRequests} />
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-3.5">
          <div className="flex items-center gap-2">
            <span
              className={cn('size-1.5 rounded-full', mode === 'api' ? 'bg-info' : 'bg-success')}
            />
            <p className="text-[9.5px] font-medium text-ink-soft">
              {mode === 'api' ? 'FastAPI repository' : 'Local synthetic repository'}
            </p>
            <span className="ml-auto text-[8px] text-ink-faint">{mode === 'api' ? 'api' : 'demo'}</span>
          </div>
          <p className="mt-1 truncate text-[8px] text-ink-faint" title={apiBaseUrl ?? undefined}>
            {mode === 'api' ? apiBaseUrl : 'No network calls · session only'}
          </p>
        </div>

        <Button variant="outline" size="sm" className="w-full" onClick={onOpenBusiness}>
          <Building2 className="size-3.5" /> Open business desktop
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => void restore()}
          disabled={resetting}
        >
          <RotateCcw className={cn('size-3.5', resetting && 'animate-spin')} />
          {resetting ? 'Restoring…' : 'Restore synthetic data'}
        </Button>

        <p className="flex items-start gap-1.5 text-[8px] leading-3.5 text-ink-faint">
          <CheckCircle2 className="mt-0.5 size-2.5 shrink-0 text-success" />
          {workspace.notice}
        </p>
      </div>
    </PhoneAppShell>
  )
}

function ProfileRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail
  label: string
  value: string
}) {
  return (
    <li className="flex items-center gap-2">
      <Icon className="size-3 shrink-0 text-ink-faint" />
      <span className="w-14 shrink-0 text-[8.5px] text-ink-faint">{label}</span>
      <span className="min-w-0 truncate text-[8.5px] font-medium text-ink-soft">{value}</span>
    </li>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface py-2">
      <p className="text-[14px] font-semibold leading-none text-ink tnum">{value}</p>
      <p className="mt-1 text-[7.5px] text-ink-faint">{label}</p>
    </div>
  )
}
