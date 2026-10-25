import { PlugZap } from 'lucide-react'
import { StateBlock } from '@/components/ui/state-block'

export function ApiRequired({ action }: { action: string }) {
  return (
    <StateBlock
      icon={PlugZap}
      title="Connect the FastAPI backend"
      description={`${action} reads and writes persisted state. Set VITE_API_BASE_URL, start the backend, then reload.`}
    />
  )
}
