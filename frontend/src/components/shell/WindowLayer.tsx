import { useWindows } from '@/store/window-provider'
import { AppWindow } from './AppWindow'

export function WindowLayer() {
  const { windows } = useWindows()

  return (
    <div className="absolute inset-0 z-20" aria-label="Open windows">
      {[...windows]
        .sort((a, b) => a.z - b.z)
        .map((instance) => (
          <AppWindow key={instance.appId} instance={instance} />
        ))}
    </div>
  )
}
