import {
  Activity,
  ClipboardList,
  Database,
  HardDrive,
  HelpCircle,
  Mail,
  MessageSquare,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { UserProfile, UserWorkspace } from '@/domain/user'
import { selectConsentHealth, selectUserSummary } from '@/data/user-selectors'
import { initials } from '@/lib/format'
import { cn } from '@/lib/cn'
import { GoogleMark } from '@/components/ui/google-mark'
import { Progress } from '@/components/ui/progress'
import type { PhoneApp } from './types'

const today = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const greeting = (hour: number) =>
  hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

const appGradients = {
  mail: 'from-[#7fa9c7] via-[#4f7f9f] to-[#325b78]',
  messages: 'from-[#86b89a] via-[#4f8b6d] to-[#2f654d]',
  google: 'from-white via-white to-[#e8eaed]',
  data: 'from-[#e2c17f] via-[#c19440] to-[#8a6521]',
  consent: 'from-[#8fb7a0] via-[#5a9576] to-[#356d54]',
  requests: 'from-[#e0b05b] via-[#c08a2f] to-[#8f651c]',
  activity: 'from-[#7ea3c3] via-[#527b9d] to-[#355b79]',
  sources: 'from-[#9aa7b8] via-[#707f92] to-[#4a5869]',
  profile: 'from-[#5a554c] via-[#3a352e] to-[#24211b]',
  help: 'from-[#c8b296] via-[#a38c6d] to-[#7b664b]',
} as const

export function PhoneHome({
  profile,
  workspace,
  now,
  onOpenApp,
}: {
  profile: UserProfile
  workspace: UserWorkspace
  now: Date
  onOpenApp: (app: PhoneApp) => void
}) {
  const summary = selectUserSummary(workspace)
  const health = selectConsentHealth(workspace)
  const latestActivity = [...workspace.activity].sort((a, b) => b.at.localeCompare(a.at))[0]
  const conversations = workspace.conversations ?? []
  const unread = conversations.reduce((total, entry) => total + entry.unreadForCustomer, 0)
  const mailCount = conversations.filter((entry) => entry.channel === 'email').length
  const messageCount = conversations.filter((entry) => entry.channel === 'chat').length

  return (
    <div className="relative h-full overflow-hidden text-white">
      <div className="wallpaper absolute inset-0" />
      <div
        className="absolute -right-24 top-24 size-72 rounded-full border border-white/[0.07]"
        aria-hidden
      />
      <div
        className="absolute -right-10 top-40 size-48 rounded-full border border-white/[0.06]"
        aria-hidden
      />

      <div className="no-scrollbar relative flex h-full flex-col overflow-y-auto px-5 pb-7 pt-[50px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/35">
              {today.format(now)}
            </p>
            <p className="mt-1.5 text-[17px] font-semibold tracking-tight text-white">
              {greeting(now.getHours())}, {profile.name.split(' ')[0]}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenApp('profile')}
            aria-label="Open profile"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20"
          >
            {initials(profile.name)}
          </button>
        </div>

        <div className="mt-4 rounded-[22px] border border-white/15 bg-white/[0.09] p-4 backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-white/40">
                Privacy health
              </p>
              <p className="mt-1 text-[27px] font-semibold leading-none tracking-tight text-white tnum">
                {health.percent}
                <span className="text-[13px] font-normal text-white/40">%</span>
              </p>
            </div>
            <ShieldCheck className="size-7 text-gold-bright/70" strokeWidth={1.4} />
          </div>
          <Progress
            value={health.percent}
            tone="gold"
            className="mt-3 h-1 bg-white/15"
            label="Consent health"
          />
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
            <button type="button" onClick={() => onOpenApp('consent')} className="text-left">
              <p className="text-[14px] font-semibold text-white tnum">
                {health.active}
                <span className="text-[10px] font-normal text-white/35">/{health.total}</span>
              </p>
              <p className="mt-0.5 text-[8.5px] text-white/40">optional consents active</p>
            </button>
            <button type="button" onClick={() => onOpenApp('requests')} className="text-left">
              <p className="text-[14px] font-semibold text-white tnum">{summary.openRequests}</p>
              <p className="mt-0.5 text-[8.5px] text-white/40">
                open request{summary.openRequests === 1 ? '' : 's'}
              </p>
            </button>
          </div>
        </div>

        {latestActivity && (
          <button
            type="button"
            onClick={() => onOpenApp('activity')}
            className="mt-3 flex w-full items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-left backdrop-blur-md transition-colors hover:bg-white/[0.1]"
          >
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10">
              <Activity className="size-2.5 text-gold-bright" />
            </span>
            <span className="min-w-0">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-white/35">
                Latest activity
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-white/75">
                {latestActivity.action}
              </span>
            </span>
          </button>
        )}

        {unread > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-gold/30 bg-gold/15 px-3 py-2 backdrop-blur-md">
            <MessageSquare className="size-3.5 text-gold-bright" />
            <p className="flex-1 text-[9.5px] text-white/80">
              {unread} unread message{unread === 1 ? '' : 's'} from the business
            </p>
            <button
              type="button"
              onClick={() => onOpenApp('messages')}
              className="text-[9px] font-semibold text-gold-bright"
            >
              Open
            </button>
          </div>
        )}

        <div className="mt-auto pt-5">
          <div className="grid grid-cols-3 gap-x-4 gap-y-5 px-2">
            <AppTile
              label="Mail"
              icon={Mail}
              gradient={appGradients.mail}
              onClick={() => onOpenApp('mail')}
              badge={mailCount}
            />
            <AppTile
              label="Messages"
              icon={MessageSquare}
              gradient={appGradients.messages}
              onClick={() => onOpenApp('messages')}
              badge={unread}
            />
            <AppTile
              label="Google"
              iconNode={<GoogleMark className="size-[23px]" />}
              gradient={appGradients.google}
              onClick={() => onOpenApp('biz-search')}
            />
            <AppTile
              label="My data"
              icon={Database}
              gradient={appGradients.data}
              onClick={() => onOpenApp('data')}
            />
            <AppTile
              label="Consent"
              icon={ShieldCheck}
              gradient={appGradients.consent}
              onClick={() => onOpenApp('consent')}
            />
            <AppTile
              label="Requests"
              icon={ClipboardList}
              gradient={appGradients.requests}
              onClick={() => onOpenApp('requests')}
              badge={summary.openRequests}
            />
            <AppTile
              label="Activity"
              icon={Activity}
              gradient={appGradients.activity}
              onClick={() => onOpenApp('activity')}
            />
            <AppTile
              label="Sources"
              icon={HardDrive}
              gradient={appGradients.sources}
              onClick={() => onOpenApp('sources')}
            />
            <AppTile
              label="Profile"
              icon={UserRound}
              gradient={appGradients.profile}
              onClick={() => onOpenApp('profile')}
            />
            <AppTile
              label="Help"
              icon={HelpCircle}
              gradient={appGradients.help}
              onClick={() => onOpenApp('help')}
            />
          </div>
          <p className="mt-5 text-center text-[8px] text-white/35">
            {messageCount} chat threads · all identity and message data is synthetic
          </p>
        </div>
      </div>
    </div>
  )
}

function AppTile({
  label,
  icon: Icon,
  iconNode,
  gradient,
  onClick,
  badge,
}: {
  label: string
  icon?: LucideIcon
  iconNode?: ReactNode
  gradient: string
  onClick: () => void
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${label}`}
      className="group flex flex-col items-center gap-1.5"
    >
      <span className="relative">
        <span
          className={cn(
            'relative flex size-[52px] items-center justify-center rounded-[14px] border border-white/15 bg-gradient-to-br shadow-[0_8px_18px_-8px_rgba(0,0,0,0.8)] transition-transform group-active:scale-95',
            gradient,
          )}
        >
          {iconNode ?? (Icon ? <Icon className="size-[22px]" strokeWidth={1.75} /> : null)}
        </span>
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[8px] font-semibold text-white ring-2 ring-[#1b1813]">
            {badge}
          </span>
        )}
      </span>
      <span className="max-w-full truncate text-[9px] font-medium text-white/85">{label}</span>
    </button>
  )
}
