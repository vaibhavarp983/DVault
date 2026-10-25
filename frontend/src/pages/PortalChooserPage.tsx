import { Link } from 'react-router-dom'
import { ArrowRight, Building2, Check, ShieldCheck, Smartphone, Sparkles } from 'lucide-react'
import { apiBaseUrl, dataMode } from '@/data/config'
import { DVaultMark } from '@/components/ui/brand'

const personalPoints = [
  'See which sources hold your data',
  'Manage marketing and analytics consent',
  'Raise and track access, erasure or export requests',
]

const businessPoints = [
  'Govern sources, records and classification',
  'Review policy outcomes and rights work',
  'Trace integrity across the audit chain',
]

export function PortalChooserPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-canvas text-ink">
      <div
        className="pointer-events-none absolute -right-40 -top-56 size-[760px] rounded-full bg-gold/[0.13] blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-64 -left-40 size-[620px] rounded-full bg-[#7c6435]/10 blur-[130px]"
        aria-hidden
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6 md:px-8">
        <div className="flex items-center gap-2.5">
          <DVaultMark className="size-9" />
          <div>
            <p className="text-[15px] font-semibold tracking-tight">DVault</p>
            <p className="text-[9px] uppercase tracking-[0.18em] text-ink-faint">
              Data governance
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-[10px] text-ink-soft sm:flex">
            <span
              className={`size-1.5 rounded-full ${dataMode === 'api' ? 'bg-info' : 'bg-success'}`}
            />
            {dataMode === 'api' ? `API · ${apiBaseUrl}` : 'Local synthetic demo'}
          </span>
          <Link
            to="/business"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10.5px] font-medium text-ink-soft transition-colors hover:bg-panel-muted hover:text-ink"
          >
            <Building2 className="size-3.5" />
            Business desktop
          </Link>
        </div>
      </header>

      <main className="relative mx-auto flex min-h-[calc(100dvh-96px)] max-w-6xl flex-col justify-center px-6 pb-16 md:px-8">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-ink">
          <Sparkles className="size-3" /> Choose your simulator
        </p>
        <h1 className="mt-3 max-w-2xl text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-ink md:text-[42px]">
          One product.
          <br />
          Two device experiences.
        </h1>
        <p className="mt-4 max-w-xl text-[13px] leading-6 text-ink-soft">
          DVault gives individuals control over their data and gives teams the governance
          workspace to manage it responsibly. Explore both as fully synthetic device simulators.
        </p>

        <div className="mt-9 grid gap-4 md:grid-cols-2">
          <AudienceCard
            to="/user"
            eyebrow="Smartphone simulator"
            title="Personal data"
            description="A phone-sized privacy app: see what is held about you, manage consent and track requests."
            icon={<Smartphone className="size-5" strokeWidth={1.8} />}
            points={personalPoints}
            accent="gold"
            cta="Open personal phone"
          />
          <AudienceCard
            to="/business"
            eyebrow="Desktop simulator"
            title="Business workspace"
            description="A Windows-style governance desktop with DVault, records, vault and File Explorer."
            icon={<Building2 className="size-5" strokeWidth={1.8} />}
            points={businessPoints}
            accent="charcoal"
            cta="Open business desktop"
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-gold" />
            Every identity and record is synthetic
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-3" /> No real personal data
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-3" /> Nothing is persisted outside the chosen repository
          </span>
        </div>
      </main>
    </div>
  )
}

function AudienceCard({
  to,
  eyebrow,
  title,
  description,
  icon,
  points,
  accent,
  cta,
}: {
  to: string
  eyebrow: string
  title: string
  description: string
  icon: React.ReactNode
  points: string[]
  accent: 'gold' | 'charcoal'
  cta: string
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-2xl border border-line bg-panel p-6 shadow-panel transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/35 hover:shadow-[0_20px_50px_-30px_rgba(36,33,27,0.45)]"
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className={
            accent === 'gold'
              ? 'flex size-11 items-center justify-center rounded-xl border border-gold/25 bg-gold-soft text-gold-ink'
              : 'flex size-11 items-center justify-center rounded-xl border border-ink/10 bg-charcoal text-gold-bright'
          }
        >
          {icon}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {eyebrow}
        </span>
      </div>
      <h2 className="mt-5 text-[20px] font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1.5 text-[11.5px] leading-5 text-ink-soft">{description}</p>
      <ul className="mt-4 space-y-2">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-[11px] leading-5 text-ink-soft">
            <span className="mt-1.5 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold-ink">
              <Check className="size-2" strokeWidth={3} />
            </span>
            {point}
          </li>
        ))}
      </ul>
      <span className="mt-6 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-gold-ink">
        {cta}
        <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}
