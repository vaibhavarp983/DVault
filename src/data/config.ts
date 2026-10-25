import type { DataMode } from './repository'

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

export const dataMode: DataMode = apiBaseUrl ? 'api' : 'local'
