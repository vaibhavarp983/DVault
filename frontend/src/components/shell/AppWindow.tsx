import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { APP_META } from '@/apps/app-meta'
import { renderApp } from '@/apps/app-registry'
import { useWindows, TASKBAR_HEIGHT, type WindowInstance } from '@/store/window-provider'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'

export function AppWindow({ instance }: { instance: WindowInstance }) {
  const { closeApp, focusApp, minimizeApp, moveWindow, resizeWindow, toggleMaximize, topAppId } =
    useWindows()
  const meta = APP_META[instance.appId]
  const Icon = meta.icon
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const focused = topAppId === instance.appId

  useEffect(() => {
    if (!instance.minimized) sectionRef.current?.focus({ preventScroll: true })
  }, [instance.minimized])

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('[data-window-control]')) return
    if (instance.maximized) return
    focusApp(instance.appId)
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: instance.x,
      y: instance.y,
    }

    const handleMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const workHeight = window.innerHeight - TASKBAR_HEIGHT
      const nextX = Math.min(
        Math.max(drag.x + moveEvent.clientX - drag.pointerX, 120 - instance.width),
        window.innerWidth - 120,
      )
      const nextY = Math.min(Math.max(drag.y + moveEvent.clientY - drag.pointerY, 0), workHeight - 44)
      moveWindow(instance.appId, nextX, nextY)
    }

    const handleUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (instance.maximized) return
    focusApp(instance.appId)
    const origin = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      width: instance.width,
      height: instance.height,
      x: instance.x,
      y: instance.y,
    }

    const handleMove = (moveEvent: PointerEvent) => {
      const workHeight = window.innerHeight - TASKBAR_HEIGHT
      const width = Math.min(
        Math.max(origin.width + moveEvent.clientX - origin.pointerX, meta.minSize.width),
        window.innerWidth - origin.x - 8,
      )
      const height = Math.min(
        Math.max(origin.height + moveEvent.clientY - origin.pointerY, meta.minSize.height),
        workHeight - origin.y - 8,
      )
      resizeWindow(instance.appId, width, height)
    }

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  const style = instance.maximized
    ? { zIndex: instance.z }
    : {
        left: instance.x,
        top: instance.y,
        width: instance.width,
        height: instance.height,
        zIndex: instance.z,
      }

  return (
    <section
      ref={sectionRef}
      role="dialog"
      aria-label={meta.title}
      aria-modal={false}
      aria-hidden={instance.minimized || undefined}
      inert={instance.minimized || undefined}
      tabIndex={-1}
      onPointerDown={() => focusApp(instance.appId)}
      style={style}
      className={cn(
        'absolute flex flex-col overflow-hidden border border-black/20 bg-canvas outline-none',
        instance.maximized
          ? 'inset-0 rounded-none'
          : 'rounded-window shadow-window animate-window-in',
        instance.minimized && 'pointer-events-none invisible',
      )}
    >
      <div
        className={cn(
          'relative flex h-11 shrink-0 select-none items-center gap-2.5 border-b border-line bg-surface px-3',
          focused && 'border-line-strong',
        )}
        onPointerDown={startDrag}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-window-control]')) return
          toggleMaximize(instance.appId)
        }}
      >
        {focused && (
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent"
            aria-hidden
          />
        )}
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gold-soft text-gold-ink ring-1 ring-gold/15">
          <Icon className="size-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="truncate text-[12.5px] font-semibold leading-4 text-ink">{meta.title}</h1>
            <span className="hidden truncate text-[10.5px] leading-4 text-ink-faint sm:block">
              {meta.subtitle}
            </span>
          </div>
        </div>
        <div className="flex h-full shrink-0 items-stretch" data-window-control>
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-10 rounded-none text-ink-soft hover:bg-panel-muted"
            aria-label={`Minimise ${meta.title}`}
            onClick={() => minimizeApp(instance.appId)}
          >
            <Minus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-10 rounded-none text-ink-soft hover:bg-panel-muted"
            aria-label={instance.maximized ? `Restore ${meta.title}` : `Maximise ${meta.title}`}
            onClick={() => toggleMaximize(instance.appId)}
          >
            {instance.maximized ? <Copy className="size-3" /> : <Square className="size-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-11 rounded-none text-ink-soft hover:bg-danger hover:text-white"
            aria-label={`Close ${meta.title}`}
            onClick={() => closeApp(instance.appId)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        {renderApp(instance.appId, instance.payload)}
      </div>

      {!instance.maximized && (
        <div
          role="presentation"
          onPointerDown={startResize}
          className="absolute bottom-0 right-0 z-10 size-4 cursor-nwse-resize"
          aria-hidden
        >
          <span className="absolute bottom-1 right-1 size-1.5 rounded-sm border-b border-r border-ink-faint/50" />
        </div>
      )}
    </section>
  )
}
