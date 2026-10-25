import {
  ClipboardList,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Mail,
  MessageSquare,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  StickyNote,
  Table2,
  Database,
  type LucideIcon,
} from 'lucide-react'
import type { DocumentKind } from '@/domain/types'
import { cn } from '@/lib/cn'

const icons: Record<DocumentKind, LucideIcon> = {
  invoice: Receipt,
  'purchase-order': ShoppingCart,
  contract: FileSignature,
  email: Mail,
  form: ClipboardList,
  'consent-record': ShieldCheck,
  note: StickyNote,
  conversation: MessageSquare,
  'crm-record': Database,
  spreadsheet: Table2,
}

const tones: Record<DocumentKind, string> = {
  invoice: 'bg-[#fbf0dd] text-[#9a6b1c] border-[#efdfc1]',
  'purchase-order': 'bg-[#f5eee1] text-[#8a6b3a] border-[#e8ddc9]',
  contract: 'bg-[#f3ecdc] text-[#7d5f22] border-[#e7dcc3]',
  email: 'bg-[#e9f0f7] text-[#3f6b96] border-[#d9e6f2]',
  form: 'bg-[#efeaf6] text-[#6c5a95] border-[#e2daf0]',
  'consent-record': 'bg-[#e5f1ea] text-[#37745a] border-[#d5e8dd]',
  note: 'bg-[#f6f0e6] text-[#8a7350] border-[#eadfce]',
  conversation: 'bg-[#e6f2ee] text-[#2f7866] border-[#d3e9e1]',
  'crm-record': 'bg-[#eef0f5] text-[#556179] border-[#dfe3ec]',
  spreadsheet: 'bg-[#eaf1e7] text-[#4f7442] border-[#dbe8d5]',
}

export function DocumentIcon({
  kind,
  className,
  iconClassName,
}: {
  kind: DocumentKind
  className?: string
  iconClassName?: string
}) {
  const Icon = icons[kind]
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg border',
        tones[kind],
        className,
      )}
      aria-hidden
    >
      <Icon className={cn('size-4', iconClassName)} strokeWidth={1.8} />
    </span>
  )
}

export function FileTypeIcon({ kind }: { kind: DocumentKind }) {
  const Icon = icons[kind] ?? FileText
  return <Icon className="size-4" strokeWidth={1.7} />
}

export function FileSpreadsheetIcon() {
  return <FileSpreadsheet className="size-4" strokeWidth={1.7} />
}
