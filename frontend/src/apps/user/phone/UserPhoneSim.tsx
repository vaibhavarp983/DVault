import {
  ClipboardList,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { selectConsentHealth, selectUserSummary } from '@/data/user-selectors'
import type { BizMessageType } from '@/domain/messaging'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useUser } from '@/store/user-provider'
import { DVaultMark } from '@/components/ui/brand'
import {
  PhoneError,
  PhoneFrame,
  PhoneLockScreen,
  PhoneNotice,
  PhoneSplash,
  StatusBar,
} from './PhoneChrome'
import { PhoneHome } from './PhoneHome'
import { PhoneDataApp } from './PhoneDataApp'
import { PhoneConsentApp } from './PhoneConsentApp'
import { PhoneRequestsApp } from './PhoneRequestsApp'
import { PhoneActivityApp } from './PhoneActivityApp'
import { PhoneSourcesApp } from './PhoneSourcesApp'
import { PhoneProfileApp } from './PhoneProfileApp'
import { PhoneHelpApp } from './PhoneHelpApp'
import { PhoneMailApp, PhoneMessagesApp } from './PhoneMessagingApp'
import type { PhoneApp } from './types'

export function UserPhoneSim() {
  const {
    status,
    data,
    error,
    mode,
    apiBaseUrl,
    notifications,
    dismissNotification,
    refresh,
  } = useUser()
  const [searchParams] = useSearchParams()
  const [app, setApp] = useState<PhoneApp>(() =>
    phoneAppFromQuery(searchParams.get('app'), searchParams.get('biz')),
  )
  const [bizIntent, setBizIntent] = useState<PhoneBizIntent | null>(() =>
    parseBizIntent(searchParams),
  )
  const [locked, setLocked] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    document.title = 'Personal phone â€” DVault'
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const latestNotice = notifications[0]
  useEffect(() => {
    if (!latestNotice) return
    const timer = window.setTimeout(
      () => dismissNotification(latestNotice.id),
      5200,
    )
    return () => window.clearTimeout(timer)
  }, [latestNotice?.id, dismissNotification])

  const health = data ? selectConsentHealth(data) : undefined
  const summary = data ? selectUserSummary(data) : undefined
  const screenDarkIcons = !locked && app !== 'home'

  const toggleLock = () => {
    setLocked((current) => {
      if (!current) {
        setApp('home')
        setBizIntent(null)
      }
      return !current
    })
  }

  const openApp = (next: PhoneApp) => {
    setApp(next)
    setLocked(false)
  }

  const goHome = () => {
    setApp('home')
    setBizIntent(null)
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <div
        className="pointer-events-none absolute -right-40 -top-52 size-[720px] rounded-full bg-gold/[0.12] blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-64 -left-48 size-[620px] rounded-full bg-[#7c6435]/10 blur-[130px]"
        aria-hidden
      />

      <header className="relative z-10 mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3 px-6 py-5 md:px-8">
        <Link to="/" className="flex items-center gap-2.5" aria-label="DVault workspace chooser">
          <DVaultMark className="size-8" />
          <div>
            <p className="text-[13px] font-semibold tracking-tight">DVault</p>
            <p className="text-[8.5px] uppercase tracking-[0.18em] text-ink-faint">
              Personal simulator
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-[10px] text-ink-soft sm:flex">
            <span
              className={cn('size-1.5 rounded-full', mode === 'api' ? 'bg-info' : 'bg-success')}
            />
            {mode === 'api' ? `API Â· ${apiBaseUrl}` : 'Local synthetic data'}
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center gap-16 px-6 pb-4 md:px-8">
        <aside className="hidden w-full max-w-sm xl:block">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-ink">
            <Sparkles className="size-3" /> Smartphone simulator
          </p>
          <h1 className="mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink">
            Your data,
            <br />
            in your pocket.
          </h1>
          <p className="mt-3 text-[12px] leading-6 text-ink-soft">
            A phone-sized privacy app for DVault. Review what is held, change consent and follow
            every rights request from submission to response.
          </p>
          <ul className="mt-5 space-y-2.5">
            {[
              { icon: ShieldCheck, text: 'Change optional consent with a single tap' },
              { icon: ClipboardList, text: 'Track access, erasure and export requests' },
              { icon: Sparkles, text: 'Every identity and record is synthetic' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <li key={item.text} className="flex items-start gap-2.5 text-[11px] text-ink-soft">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-gold/20 bg-gold-soft text-gold-ink">
                    <Icon className="size-2.5" />
                  </span>
                  {item.text}
                </li>
              )
            })}
          </ul>
          {data && (
            <p className="mt-5 text-[9px] text-ink-faint">
              {data.documents.length} records Â· {data.sources.length} sources Â· updated{' '}
              {formatDate(data.generatedAt)}
            </p>
          )}
        </aside>

        <PhoneFrame locked={locked} onToggleLock={toggleLock} indicatorDark={screenDarkIcons}>
          <StatusBar dark={screenDarkIcons && !locked} now={now} />

          {locked ? (
            <PhoneLockScreen
              now={now}
              onUnlock={() => setLocked(false)}
              consentPercent={health?.percent ?? 0}
              openRequests={summary?.openRequests ?? 0}
            />
          ) : status === 'loading' ? (
            <PhoneSplash />
          ) : status === 'error' || !data ? (
            <PhoneError
              message={error ?? 'The personal repository did not respond.'}
              onRetry={() => void refresh()}
            />
          ) : app === 'home' ? (
            <PhoneHome
              profile={data.profile}
              workspace={data}
              now={now}
              onOpenApp={openApp}
            />
          ) : (
            <>
              {app === 'mail' && (
                <PhoneMailApp
                  workspace={data}
                  onBack={goHome}
                  initialBizCode={bizIntent?.code}
                  initialMessageType={bizIntent?.type}
                />
              )}
              {app === 'messages' && (
                <PhoneMessagesApp
                  workspace={data}
                  onBack={goHome}
                  initialBizCode={bizIntent?.code}
                  initialMessageType={bizIntent?.type}
                />
              )}
              {app === 'data' && <PhoneDataApp workspace={data} onBack={goHome} />}
              {app === 'consent' && <PhoneConsentApp workspace={data} onBack={goHome} />}
              {app === 'requests' && <PhoneRequestsApp workspace={data} onBack={goHome} />}
              {app === 'activity' && <PhoneActivityApp workspace={data} onBack={goHome} />}
              {app === 'sources' && (
                <PhoneSourcesApp
                  workspace={data}
                  onBack={goHome}
                  onOpenData={() => setApp('data')}
                />
              )}
              {app === 'profile' && <PhoneProfileApp workspace={data} onBack={goHome} />}
              {app === 'help' && (
                <PhoneHelpApp onBack={goHome} onOpenApp={openApp} />
              )}
            </>
          )}

          {!locked && latestNotice && status === 'ready' && (
            <PhoneNotice
              notification={latestNotice}
              onDismiss={() => dismissNotification(latestNotice.id)}
              belowHeader={app !== 'home'}
            />
          )}
        </PhoneFrame>
      </main>

      <footer className="relative z-10 px-6 pb-4 text-center text-[9px] text-ink-faint">
        Synthetic smartphone simulator Â· no real personal data Â· {mode === 'api' ? 'FastAPI repository' : 'local repository'}
      </footer>
    </div>
  )
}

interface PhoneBizIntent {
  code: string
  type?: BizMessageType
}

const BIZ_TYPE_BY_QUERY: Record<string, BizMessageType> = {
  enquiry: 'GENERAL_ENQUIRY',
  general: 'GENERAL_ENQUIRY',
  general_enquiry: 'GENERAL_ENQUIRY',
  quote: 'QUOTE_REQUEST',
  quote_request: 'QUOTE_REQUEST',
  purchase: 'PURCHASE_ORDER',
  po: 'PURCHASE_ORDER',
  purchase_order: 'PURCHASE_ORDER',
  invoice: 'INVOICE',
  support: 'SUPPORT',
}

function parseBizIntent(params: URLSearchParams): PhoneBizIntent | null {
  const code = params.get('biz')?.trim()
  if (!code) return null
  const raw = params.get('type')?.trim().toLowerCase().replace(/[-\s]/g, '_')
  return {
    code,
    type: raw ? BIZ_TYPE_BY_QUERY[raw] : undefined,
  }
}

function phoneAppFromQuery(value: string | null, bizCode: string | null): PhoneApp {
  const app = value?.trim().toLowerCase()
  if (app === 'mail') return 'mail'
  if (app === 'chat' || app === 'message' || app === 'messages' || bizCode) return 'messages'
  return 'home'
}
