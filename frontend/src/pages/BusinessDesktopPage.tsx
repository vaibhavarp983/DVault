import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { Desktop } from '@/components/shell/Desktop'
import { DemoProvider } from '@/store/demo-provider'
import { WindowProvider } from '@/store/window-provider'

class DesktopErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The DVault desktop failed to render.', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-dvh w-full items-center justify-center bg-charcoal px-6">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-white">
            <p className="text-[13px] font-semibold">The desktop could not render</p>
            <p className="mt-2 text-[11px] leading-5 text-white/50">
              {this.state.error.message ||
                'An unexpected error occurred while loading the workspace.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-gold px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-gold-bright"
            >
              Reload desktop
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Set the body background to match the dark desktop wallpaper so no light-themed
 * canvas colour flashes between the landing page and the desktop paint.
 */
function useDesktopBodyClass() {
  useEffect(() => {
    document.body.classList.add('bg-charcoal')
    document.body.classList.remove('bg-canvas')
    return () => {
      document.body.classList.remove('bg-charcoal')
      document.body.classList.add('bg-canvas')
    }
  }, [])
}

export function BusinessDesktopPage() {
  useDesktopBodyClass()
  return (
    <DesktopErrorBoundary>
      <DemoProvider>
        <WindowProvider>
          <Desktop />
        </WindowProvider>
      </DemoProvider>
    </DesktopErrorBoundary>
  )
}
