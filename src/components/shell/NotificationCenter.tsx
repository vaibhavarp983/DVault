import { Bell, BellOff, Check, CheckCircle2, CircleAlert, ShieldAlert, Trash2, X } from 'lucide-react'
import type { AppNotification } from '@/domain/types'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demo-provider'
import { useWindows } from '@/store/window-provider'

const toneStyles: Record<AppNotification['tone'], { icon: typeof Bell; className: string }> = {
  info: { icon: Bell, className: 'bg-info/15 text-[#8fc0ea]' },
  success: { icon: CheckCircle2, className: 'bg-success/20 text-[#77c9a5]' },
  warning: { icon: CircleAlert, className: 'bg-warning/20 text-[#e4b15f]' },
  danger: { icon: ShieldAlert, className: 'bg-danger/20 text-[#ef9388]' },
}

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    notifications,
    unreadCount,
    dismissNotification,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
  } = useDemo()
  const { showApp } = useWindows()

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="acrylic-strong animate-flyout-in absolute bottom-[68px] right-3 z-[60] flex max-h-[min(560px,calc(100vh-92px))] w-[min(392px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-white/[0.12] text-white shadow-flyout"
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
        <div>
          <h2 className="text-[12.5px] font-semibold">Notifications</h2>
          <p className="mt-0.5 text-[10px] text-white/40">
            {notifications.length === 0
              ? 'Nothing waiting for you'
              : `${unreadCount} unread of ${notifications.length}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={markAllNotificationsRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-white/55 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <Check className="size-3" />
            Mark read
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="flex size-7 items-center justify-center rounded text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/35">
              <BellOff className="size-5" />
            </span>
            <p className="text-[12px] font-medium text-white/70">You are all caught up</p>
            <p className="text-[10.5px] leading-4 text-white/35">
              New alerts from policies, sync jobs and rights requests will appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {notifications.map((notification) => {
              const tone = toneStyles[notification.tone]
              const Icon = tone.icon
              return (
                <li key={notification.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      markNotificationRead(notification.id)
                      if (notification.appId) {
                        showApp(notification.appId)
                        onClose()
                      }
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 pr-8 text-left transition-colors hover:bg-white/[0.06]',
                      !notification.read && 'bg-white/[0.035]',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
                        tone.className,
                      )}
                    >
                      <Icon className="size-3.5" strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[11.5px] font-medium text-white/90">
                          {notification.title}
                        </span>
                        {!notification.read && (
                          <span className="size-1.5 shrink-0 rounded-full bg-gold" aria-label="Unread" />
                        )}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-4 text-white/45">
                        {notification.body}
                      </span>
                      <span className="mt-1 block text-[9.5px] text-white/25">
                        {formatRelative(notification.at)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Dismiss ${notification.title}`}
                    onClick={() => dismissNotification(notification.id)}
                    className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded text-white/30 opacity-0 transition-all hover:bg-white/10 hover:text-white/80 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {notifications.length > 0 && (
        <footer className="border-t border-white/[0.08] p-2">
          <button
            type="button"
            onClick={clearNotifications}
            className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[10.5px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/80"
          >
            <Trash2 className="size-3" />
            Clear all notifications
          </button>
        </footer>
      )}
    </div>
  )
}
