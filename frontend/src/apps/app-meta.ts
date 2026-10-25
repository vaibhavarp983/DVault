import { FolderOpen, LockKeyhole, type LucideIcon } from 'lucide-react'

export type AppId = 'vault' | 'file-explorer'

export interface AppMeta {
  id: AppId
  title: string
  subtitle: string
  icon: LucideIcon
  defaultSize: { width: number; height: number }
  minSize: { width: number; height: number }
}

export const APP_META: Record<AppId, AppMeta> = {
  vault: {
    id: 'vault',
    title: 'DVault',
    subtitle: 'Governance workspace',
    icon: LockKeyhole,
    defaultSize: { width: 1400, height: 840 },
    minSize: { width: 1120, height: 660 },
  },
  'file-explorer': {
    id: 'file-explorer',
    title: 'File Explorer',
    subtitle: 'DVault (D:)',
    icon: FolderOpen,
    defaultSize: { width: 1080, height: 700 },
    minSize: { width: 820, height: 520 },
  },
}

export const APP_ORDER: AppId[] = ['vault', 'file-explorer']
