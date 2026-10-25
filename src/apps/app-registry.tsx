import type { ReactNode } from 'react'
import type { AppId } from './app-meta'
import type { WindowPayload } from '@/store/window-provider'
import { DVaultApp } from './vault/DVaultApp'
import { FileExplorerApp } from './file-explorer/FileExplorerApp'

export function renderApp(appId: AppId, payload?: WindowPayload): ReactNode {
  switch (appId) {
    case 'vault':
      return <DVaultApp payload={payload} />
    case 'file-explorer':
      return <FileExplorerApp payload={payload} />
  }
}
