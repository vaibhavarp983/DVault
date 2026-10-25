import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BookOpen,
  Briefcase,
  Car,
  Check,
  ChevronLeft,
  Clock,
  Copy,
  Globe,
  Hash,
  HeartPulse,
  Mail,
  MapPin,
  MessageSquare,
  Newspaper,
  Search,
  Star,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from 'lucide-react'
import { initials } from '@/lib/format'
import { cn } from '@/lib/cn'
import { businesses, searchBusinesses, type Business } from './businesses'
import { news, type NewsItem } from './news'

const categories = [...new Set(businesses.map((business) => business.category))]

const newsIcons: Record<NewsItem['category'], LucideIcon> = {
  Local: MapPin,
  Food: UtensilsCrossed,
  Health: HeartPulse,
  Culture: BookOpen,
  Auto: Car,
  Business: Briefcase,
}

export function BizSearchApp({
  onBack,
  onOpenEmail,
  onOpenMessage,
}: {
  onBack: () => void
  onOpenEmail: (business: Business) => void
  onOpenMessage: (business: Business) => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Business | null>(null)
  const [copied, setCopied] = useState(false)
  const results = useMemo(() => searchBusinesses(query), [query])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copyBizCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // Clipboard can be blocked in some demo environments.
    }
    setCopied(true)
  }

  return (
    <div className="relative h-full overflow-hidden text-white">
      <div className="wallpaper absolute inset-0" />
      <div className="relative flex h-full min-h-0 flex-col pt-[38px]">
        <header className="flex h-12 shrink-0 items-center gap-1.5 px-2.5">
          <button
            type="button"
            onClick={selected ? () => setSelected(null) : onBack}
            aria-label={selected ? 'Back to search results' : 'Back to home screen'}
            className="flex size-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="size-4.5" strokeWidth={2} />
          </button>
          <Wordmark />
          <span className="ml-auto rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[8px] font-medium uppercase tracking-[0.14em] text-white/45">
            Demo
          </span>
        </header>

        {selected ? (
          <Profile
            business={selected}
            copied={copied}
            onCopy={() => void copyBizCode(selected.bizCode)}
            onOpenEmail={onOpenEmail}
            onOpenMessage={onOpenMessage}
          />
        ) : (
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <div className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.09] px-3.5 backdrop-blur-md focus-within:border-gold-bright/60">
              <Search className="size-4 shrink-0 text-white/45" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search businesses or BizCode"
                aria-label="Search businesses"
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-[11.5px] text-white placeholder:text-white/35 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-white/70 hover:bg-white/25"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {!query ? (
              <>
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">
                      <Newspaper className="size-3 text-gold-bright/70" /> Discover
                    </p>
                    <p className="text-[8px] text-white/25">News for you</p>
                  </div>
                  <div className="mt-2 space-y-2">
                    {news.map((item, index) => (
                      <NewsCard key={item.id} item={item} featured={index === 0} />
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/35">
                    Browse categories
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {categories.slice(0, 5).map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setQuery(category)}
                        className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[9px] text-white/65 hover:bg-white/12 hover:text-white"
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 flex items-baseline justify-between gap-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">
                    Search results
                  </p>
                  <p className="text-[8.5px] text-white/35">
                    {results.length} {results.length === 1 ? 'business' : 'businesses'}
                  </p>
                </div>

                <div className="mt-2 space-y-2">
                  {results.map((business) => (
                    <ResultCard
                      key={business.bizCode}
                      business={business}
                      onOpen={() => setSelected(business)}
                    />
                  ))}
                </div>

                {results.length === 0 && (
                  <div className="mt-12 flex flex-col items-center px-6 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
                      <Search className="size-5 text-white/30" />
                    </span>
                    <p className="mt-3 text-[12px] font-semibold text-white">
                      No businesses found
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-white/45">
                      Nothing matches “{query}”. Try a business name, category or BizCode such as
                      BV-REST-1001.
                    </p>
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="mt-4 rounded-full border border-gold-bright/40 bg-gold/20 px-4 py-1.5 text-[9.5px] font-semibold text-gold-bright"
                    >
                      Clear search
                    </button>
                  </div>
                )}
              </>
            )}

            <p className="mt-5 text-center text-[8px] leading-3.5 text-white/30">
              Fictional demo content. Stock photos via Unsplash. Not real businesses or news
              sources, and not connected to Google.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Wordmark() {
  return (
    <span className="text-[17px] font-medium leading-none tracking-tight" aria-label="Google">
      <span className="text-[#8ab4f8]">G</span>
      <span className="text-[#f28b82]">o</span>
      <span className="text-[#fdd663]">o</span>
      <span className="text-[#8ab4f8]">g</span>
      <span className="text-[#81c995]">l</span>
      <span className="text-[#f28b82]">e</span>
    </span>
  )
}

function NewsCard({ item, featured = false }: { item: NewsItem; featured?: boolean }) {
  const Icon = newsIcons[item.category]

  if (featured) {
    return (
      <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md">
        <div className="relative h-[104px] w-full">
          <img src={item.image} alt="" className="size-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#14110d] via-[#14110d]/25 to-transparent" />
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full border border-white/15 bg-black/45 px-2 py-0.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-white/85 backdrop-blur-sm">
            <Icon className="size-2.5 text-gold-bright" />
            {item.category}
            <span className="text-white/35">· {item.meta}</span>
          </span>
        </div>
        <div className="p-2.5">
          <p className="text-[11.5px] font-semibold leading-4 text-white">{item.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[8.5px] leading-3.5 text-white/45">
            {item.summary}
          </p>
        </div>
      </article>
    )
  }

  return (
    <article className="flex gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 backdrop-blur-md">
      <span className="size-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.05]">
        <img src={item.image} alt="" className="size-full object-cover" loading="lazy" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[7px] font-semibold uppercase tracking-[0.1em] text-gold-bright/75">
          <Icon className="size-2.5" />
          {item.category}
          <span className="font-normal normal-case tracking-normal text-white/25">
            · {item.meta}
          </span>
        </p>
        <p className="mt-0.5 line-clamp-2 text-[10.5px] font-semibold leading-3.5 text-white">
          {item.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[8.5px] leading-3.5 text-white/45">
          {item.summary}
        </p>
      </div>
    </article>
  )
}

function ResultCard({ business, onOpen }: { business: Business; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-left backdrop-blur-md transition-colors active:bg-white/[0.12]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#e2c17f] via-[#c19440] to-[#8a6521] text-[11px] font-semibold text-[#1b1813]">
        {initials(business.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-semibold text-white">
          {business.name}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[8.5px] text-white/45">
          <span>{business.category}</span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-0.5 text-gold-bright">
            <Star className="size-2.5 fill-gold-bright" />
            {business.rating.toFixed(1)}
            <span className="text-white/35">({business.reviews})</span>
          </span>
        </span>
        <span className="mt-1 block line-clamp-2 text-[9px] leading-3.5 text-white/55">
          {business.description}
        </span>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.07] px-2 py-0.5 font-mono text-[8px] tracking-wide text-white/55">
          <Hash className="size-2.5" />
          {business.bizCode}
        </span>
      </span>
    </button>
  )
}

function Profile({
  business,
  copied,
  onCopy,
  onOpenEmail,
  onOpenMessage,
}: {
  business: Business
  copied: boolean
  onCopy: () => void
  onOpenEmail: (business: Business) => void
  onOpenMessage: (business: Business) => void
}) {
  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <div className="rounded-2xl border border-white/12 bg-white/[0.08] p-4 backdrop-blur-md">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#e2c17f] via-[#c19440] to-[#8a6521] text-[15px] font-semibold text-[#1b1813]">
            {initials(business.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[8.5px] font-medium uppercase tracking-[0.12em] text-white/40">
              {business.category}
            </p>
            <h2 className="mt-1 text-[17px] font-semibold leading-tight text-white">
              {business.name}
            </h2>
            <p className="mt-1 flex items-center gap-1 text-[9.5px] text-white/55">
              <Star className="size-3 fill-gold-bright text-gold-bright" />
              <span className="font-semibold text-gold-bright">{business.rating.toFixed(1)}</span>
              <span>· {business.reviews} reviews</span>
            </p>
          </div>
        </div>

        <p className="mt-3 text-[9.5px] leading-4 text-white/60">{business.description}</p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onOpenEmail(business)}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold text-[10.5px] font-semibold text-white shadow-sm transition-colors hover:bg-gold-ink"
          >
            <Mail className="size-3.5" /> Email
          </button>
          <button
            type="button"
            onClick={() => onOpenMessage(business)}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 text-[10.5px] font-semibold text-white transition-colors hover:bg-white/15"
          >
            <MessageSquare className="size-3.5" /> Message
          </button>
        </div>
      </div>

      <div className="mt-3 divide-y divide-white/[0.07] rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md">
        <InfoRow icon={Hash} label="BizCode">
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-wide text-white">
              {business.bizCode}
            </span>
            <button
              type="button"
              onClick={onCopy}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-medium transition-colors',
                copied
                  ? 'border-success/40 bg-success/20 text-[#9fdcbd]'
                  : 'border-white/15 bg-white/[0.08] text-white/60 hover:bg-white/15 hover:text-white',
              )}
            >
              {copied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </span>
        </InfoRow>
        <InfoRow icon={MapPin} label="Address">
          {business.address}
        </InfoRow>
        <InfoRow icon={Clock} label="Hours">
          {business.hours}
        </InfoRow>
        <InfoRow icon={Globe} label="Website">
          {business.website}
        </InfoRow>
        <InfoRow icon={Mail} label="Email">
          {business.email}
        </InfoRow>
      </div>

      <p className="mt-4 px-1 text-[8px] leading-3.5 text-white/30">
        Fictional demo listing. The BizCode replaces a phone number and is copied locally on this
        device.
      </p>
    </div>
  )
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-2.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-gold-bright/70" strokeWidth={1.8} />
      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-medium uppercase tracking-[0.12em] text-white/35">
          {label}
        </p>
        <div className="mt-0.5 text-[9.5px] leading-4 text-white/75">{children}</div>
      </div>
    </div>
  )
}
