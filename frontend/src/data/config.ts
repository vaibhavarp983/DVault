import type { DataMode } from './repository'

export type ContactMode = 'masked' | 'synthetic'

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

export const workspaceRef =
  (import.meta.env.VITE_WORKSPACE_REF ?? 'default').trim() || 'default'

export const demoApiPrefix = `/api/v1/workspaces/${encodeURIComponent(workspaceRef)}/demo`

export const demoControlsEnabled = import.meta.env.VITE_ENABLE_DEMO_CONTROLS === 'true'

export const defaultContactMode: ContactMode = 'masked'

export const dataMode: DataMode = apiBaseUrl ? 'api' : 'local'
