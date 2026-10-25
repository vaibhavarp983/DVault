import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './button'

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  children,
  hideCancel = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  children?: ReactNode
  hideCancel?: boolean
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-[300]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-charcoal/55 backdrop-blur-[2px] transition duration-150 data-[closed]:opacity-0"
      />
      <div className="fixed inset-0 flex items-center justify-center p-6">
        <DialogPanel
          transition
          className="w-full max-w-md rounded-xl border border-line bg-panel p-6 shadow-flyout transition duration-150 data-[closed]:scale-[0.98] data-[closed]:opacity-0"
        >
          <DialogTitle className="text-[15px] font-semibold text-ink">{title}</DialogTitle>
          {description && (
            <p className="mt-2 text-xs leading-5 text-ink-soft">{description}</p>
          )}
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-6 flex justify-end gap-2">
            {!hideCancel && (
              <Button variant="ghost" onClick={onClose}>
                {cancelLabel}
              </Button>
            )}
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onClick={() => {
                onConfirm()
                onClose()
              }}
              className={cn('min-w-24')}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
