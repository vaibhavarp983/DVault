import { Plus } from 'lucide-react'
import { cn } from '@/lib/cn'

export function IdProofAttachments({
  onOpen,
  disabled = false,
}: {
  onOpen: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-label="Add attachment"
      title="Share an ID proof"
      className={cn(
        'mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-ink-soft transition-colors hover:border-gold/40 hover:text-gold-ink disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      <Plus className="size-4" strokeWidth={2.4} />
    </button>
  )
}
