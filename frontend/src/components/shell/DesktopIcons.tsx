import { useState } from 'react'
import { APP_META, APP_ORDER, type AppId } from '@/apps/app-meta'
import { useWindows } from '@/store/window-provider'
import { cn } from '@/lib/cn'

export function DesktopIcons() {
  const { showApp } = useWindows()
  const [selected, setSelected] = useState<AppId | null>(null)

  return (
    <div
      className="absolute left-3 top-3 z-10 grid w-[100px] auto-rows-min gap-1"
      role="list"
      aria-label="Desktop icons"
    >
      {APP_ORDER.map((appId) => {
        const app = APP_META[appId]
        const Icon = app.icon
        const isSelected = selected === appId
        return (
          <button
            key={appId}
            type="button"
            role="listitem"
            aria-label={`Open ${app.title}`}
            onClick={() => setSelected(appId)}
            onDoubleClick={() => showApp(appId)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                showApp(appId)
              }
            }}
            onBlur={() => setSelected((current) => (current === appId ? null : current))}
            className={cn(
              'group flex w-[92px] flex-col items-center gap-1.5 rounded-md border px-1.5 pb-2 pt-2 text-center transition-colors duration-100',
              isSelected
                ? 'border-white/25 bg-white/15'
                : 'border-transparent hover:border-white/10 hover:bg-white/[0.08]',
            )}
          >
            <span
              className={cn(
                'flex size-11 items-center justify-center rounded-[10px] shadow-[0_6px_16px_-6px_rgba(0,0,0,0.7)] ring-1 ring-white/15',
                appId === 'vault' &&
                  'bg-gradient-to-br from-[#e0bd78] via-[#c2953f] to-[#8d6520]',
                appId === 'mail' &&
                  'bg-gradient-to-br from-[#7fa9c7] via-[#4f7f9f] to-[#325b78]',
                appId === 'messages' &&
                  'bg-gradient-to-br from-[#86b89a] via-[#4f8b6d] to-[#2f654d]',
                appId === 'file-explorer' &&
                  'bg-gradient-to-br from-[#e8c079] via-[#c99a45] to-[#9c7529]',
              )}
            >
              <Icon className="size-[22px] text-white" strokeWidth={1.85} />
            </span>
            <span className="line-clamp-2 max-w-full text-[11px] font-medium leading-[1.25] text-white/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_0_12px_rgba(0,0,0,0.5)]">
              {app.title}
            </span>
          </button>
        )
      })}
    </div>
  )
}
