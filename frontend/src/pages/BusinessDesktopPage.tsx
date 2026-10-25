import { Desktop } from '@/components/shell/Desktop'
import { DemoProvider } from '@/store/demo-provider'
import { WindowProvider } from '@/store/window-provider'

export function BusinessDesktopPage() {
  return (
    <DemoProvider>
      <WindowProvider>
        <Desktop />
      </WindowProvider>
    </DemoProvider>
  )
}
