import { FolderOpen, LockKeyhole, Mail, MessageSquare, type LucideIcon } from 'lucide-react'

export type AppId = 'vault' | 'file-explorer' | 'mail' | 'messages'

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
  mail: {
    id: 'mail',
    title: 'Mail',
    subtitle: 'Customer email threads',
    icon: Mail,
    defaultSize: { width: 1180, height: 740 },
    minSize: { width: 860, height: 540 },
  },
  messages: {
    id: 'messages',
    title: 'Messages',
    subtitle: 'Customer chat threads',
    icon: MessageSquare,
    defaultSize: { width: 1180, height: 740 },
    minSize: { width: 860, height: 540 },
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

export const APP_ORDER: AppId[] = ['vault', 'mail', 'messages', 'file-explorer']
