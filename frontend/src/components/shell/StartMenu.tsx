import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import {
  Building2,
  ChevronRight,
  Database,
  FileClock,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Power,
  Scale,
  Send,
  ShieldAlert,
  RotateCcw,
  Search,
  Sparkles,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppId } from '@/apps/app-meta'
import { selectDocumentLibrary } from '@/data/selectors'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import { useWindows, type WorkspaceSection } from '@/store/window-provider'
import { DocumentIcon } from '@/components/ui/document-icon'
import { DVaultMark } from '@/components/ui/brand'

interface PinnedItem {
  id: string
  label: string
  keywords: string
  icon: LucideIcon
  gradient: string
  appId: AppId
  section?: WorkspaceSection
}

const pinnedItems: PinnedItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    keywords: 'control center governance health activity',
    icon: LayoutDashboard,
    gradient: 'from-[#6e9b82] via-[#47775f] to-[#2f5845]',
    appId: 'vault',
    section: 'overview',
  },
  {
    id: 'records',
    label: 'Records',
    keywords: 'data explorer sources files classification records',
    icon: Database,
    gradient: 'from-[#6e8fab] via-[#486b88] to-[#2f5069]',
    appId: 'vault',
    section: 'records',
  },
  {
    id: 'policies',
    label: 'Policy Center',
    keywords: 'policy rules decisions evaluate consent marketing',
    icon: Scale,
    gradient: 'from-[#8fa8c4] via-[#617e9b] to-[#3e5c75]',
    appId: 'vault',
    section: 'policies',
  },
  {
    id: 'messages',
    label: 'Message Gate',
    keywords: 'campaigns messages preview execute outbox',
    icon: Send,
    gradient: 'from-[#b78f57] via-[#936d36] to-[#6d4c21]',
    appId: 'vault',
    section: 'messages',
  },
  {
    id: 'rights',
    label: 'Rights Queue',
    keywords: 'rights requests access erasure portability rectification holds',
    icon: FileClock,
    gradient: 'from-[#b98a8a] via-[#956666] to-[#714848]',
    appId: 'vault',
    section: 'rights',
  },
  {
    id: 'jobs',
    label: 'Job Manager',
    keywords: 'jobs timeline retry imports checkpoints',
    icon: ListChecks,
    gradient: 'from-[#7f9b8a] via-[#597666] to-[#3c5848]',
    appId: 'vault',
    section: 'jobs',
  },
  {
    id: 'security',
    label: 'Security Center',
    keywords: 'security integrity evidence breach incidents reset tamper',
    icon: ShieldAlert,
    gradient: 'from-[#a88b6e] via-[#82694f] to-[#5d4936]',
    appId: 'vault',
    section: 'security',
  },
  {
    id: 'vault',
    label: 'Vault',
    keywords: 'sealed documents collections lock',
    icon: LockKeyhole,
    gradient: 'from-[#e0bd78] via-[#c2953f] to-[#8d6520]',
    appId: 'vault',
    section: 'vault',
  },
  {
    id: 'file-explorer',
    label: 'File Explorer',
    keywords: 'files folders drive',
    icon: FolderOpen,
    gradient: 'from-[#e8c079] via-[#c99a45] to-[#9c7529]',
    appId: 'file-explorer',
  },
]

export function StartMenu({
  open,
  onClose,
  onRequestReset,
  onShowAbout,
  onCloseAllWindows,
}: {
  open: boolean
  onClose: () => void
  onRequestReset: () => void
  onShowAbout: () => void
  onCloseAllWindows: () => void
}) {
  const { data, status, mode } = useDemo()
  const { showApp } = useWindows()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const frame = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => window.clearTimeout(frame)
  }, [open])

  const apps = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return pinnedItems
    return pinnedItems.filter((item) =>
      `${item.label} ${item.keywords}`.toLowerCase().includes(term),
    )
  }, [query])

  const documents = useMemo(() => {
    if (!data) return []
    return selectDocumentLibrary(data, { search: query }).slice(0, query ? 5 : 4)
  }, [data, query])

  const launchPinned = (item: PinnedItem) => {
    showApp(item.appId, item.section ? { section: item.section } : undefined)
    onClose()
  }

  const openRecords = (documentId?: string) => {
    showApp('vault', { section: 'records', documentId })
    onClose()
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Start menu"
      className="acrylic-strong animate-flyout-in absolute bottom-[68px] left-1/2 z-[60] flex max-h-[min(640px,calc(100vh-92px))] w-[min(660px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-white/[0.12] text-white shadow-flyout"
    >
      <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 pt-4 pb-3.5">
        <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.045] px-3 focus-within:border-gold/45 focus-within:bg-white/[0.07]">
          <Search className="size-4 shrink-0 text-white/35" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search apps, records and customers"
            aria-label="Search apps and records"
            className="h-9 w-full bg-transparent text-[12px] text-white/90 outline-none placeholder:text-white/35"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="flex size-5 items-center justify-center rounded text-white/40 hover:bg-white/10 hover:text-white/80"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
            {query ? 'Apps & records' : 'Pinned'}
          </p>
          {!query && (
            <button
              type="button"
              onClick={() => openRecords()}
              className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/75"
            >
              Browse records <ChevronRight className="size-3" />
            </button>
          )}
        </div>

        {apps.length > 0 && (
          <div className="grid grid-cols-4 gap-1">
            {apps.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => launchPinned(item)}
                  className="group flex flex-col items-center gap-2 rounded-lg px-2 py-3 text-center transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.07]"
                >
                  <span
                    className={cn(
                      'flex size-10 items-center justify-center rounded-[10px] bg-gradient-to-br shadow-[0_6px_16px_-6px_rgba(0,0,0,0.8)] ring-1 ring-white/15 transition-transform group-active:scale-95',
                      item.gradient,
                    )}
                  >
                    <Icon className="size-5 text-white" strokeWidth={1.85} />
                  </span>
                  <span className="line-clamp-2 text-[11px] leading-tight text-white/85">
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="mb-2 mt-4 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
            {query ? 'Matching records' : 'Recommended'}
          </p>
          <p className="text-[10px] text-white/30">
            {data
              ? query
                ? `${documents.length} result${documents.length === 1 ? '' : 's'}`
                : `${data.documents.filter((document) => document.importState === 'indexed').length} indexed records`
              : ''}
          </p>
        </div>

        {status === 'loading' && (
          <div className="space-y-2" aria-label="Loading records">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-11 animate-pulse rounded-lg bg-white/[0.05]" />
            ))}
          </div>
        )}

        {status === 'ready' && documents.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/10 px-4 py-5 text-center">
            <p className="text-[12px] font-medium text-white/70">No matching records</p>
            <p className="mt-1 text-[10.5px] leading-4 text-white/35">
              Try a customer name, document type or source.
            </p>
          </div>
        )}

        {documents.length > 0 && (
          <ul className="space-y-0.5">
            {documents.map((document) => (
              <li key={document.id}>
                <button
                  type="button"
                  onClick={() => openRecords(document.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.07]"
                >
                  <DocumentIcon kind={document.kind} className="size-8 ring-1 ring-white/10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-white/85">
                      {document.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-white/35">
                      {formatDate(document.modifiedAt)} · {document.snippet.slice(0, 54)}…
                    </span>
                  </span>
                  <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[9.5px] text-white/45">
                    Record
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
        <button
          type="button"
          onClick={onShowAbout}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
        >
          <span className="flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[10px] font-semibold text-white/80">
            DO
          </span>
          <span className="leading-tight">
            <span className="block text-[11.5px] font-medium text-white/85">Demo operator</span>
            <span className="block text-[9.5px] text-white/35">Synthetic local session</span>
          </span>
        </button>

        <div className="flex items-center gap-1">
          <span className="mr-1 hidden items-center gap-1 text-[9.5px] text-white/30 sm:flex">
            <Sparkles className="size-3" />
            {mode === 'api' ? 'FastAPI repository' : 'No data leaves this browser'}
          </span>
          <Menu>
            <MenuButton
              className="flex size-8 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Power options"
            >
              <Power className="size-4" />
            </MenuButton>
            <MenuItems
              transition
              anchor="top end"
              className="z-[80] w-60 rounded-lg border border-white/10 bg-[#23201b]/95 p-1 shadow-flyout backdrop-blur-xl transition duration-100 [--anchor-gap:8px] data-[closed]:opacity-0"
            >
              <MenuItem
                as="button"
                onClick={onRequestReset}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11.5px] text-white/80 data-[focus]:bg-white/10"
              >
                <RotateCcw className="size-3.5 text-white/50" />
                Reset demo data
              </MenuItem>
              <MenuItem
                as="button"
                onClick={onCloseAllWindows}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11.5px] text-white/80 data-[focus]:bg-white/10"
              >
                <X className="size-3.5 text-white/50" />
                Close all windows
              </MenuItem>
              <div className="my-1 h-px bg-white/[0.08]" />
              <MenuItem
                as="button"
                onClick={() => {
                  onClose()
                  navigate('/user')
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11.5px] text-white/80 data-[focus]:bg-white/10"
              >
                <UserRound className="size-3.5 text-white/50" />
                Personal phone
              </MenuItem>
              <MenuItem
                as="button"
                onClick={() => {
                  onClose()
                  navigate('/')
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11.5px] text-white/80 data-[focus]:bg-white/10"
              >
                <Building2 className="size-3.5 text-white/50" />
                Simulator chooser
              </MenuItem>
              <div className="my-1 h-px bg-white/[0.08]" />
              <div className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-white/35">
                <DVaultMark className="size-4" />
                DVault desktop · Phase 1 preview
              </div>
            </MenuItems>
          </Menu>
        </div>
      </footer>
    </div>
  )
}
