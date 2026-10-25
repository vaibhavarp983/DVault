import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import { APP_META, type AppId } from '@/apps/app-meta'

export const TASKBAR_HEIGHT = 56

export type WorkspaceSection =
  | 'overview'
  | 'records'
  | 'policies'
  | 'messages'
  | 'rights'
  | 'jobs'
  | 'security'
  | 'vault'

export interface WindowPayload {
  section?: WorkspaceSection
  documentId?: string
  customerId?: string
  sourceId?: string
  search?: string
}

export interface WindowInstance {
  appId: AppId
  x: number
  y: number
  width: number
  height: number
  z: number
  minimized: boolean
  maximized: boolean
  restore?: { x: number; y: number; width: number; height: number }
  payload?: WindowPayload
}

interface WindowState {
  windows: WindowInstance[]
  topZ: number
}

interface WorkArea {
  width: number
  height: number
}

type WindowAction =
  | { type: 'open'; instance: WindowInstance }
  | { type: 'close'; appId: AppId }
  | { type: 'close-all' }
  | { type: 'minimize-all' }
  | { type: 'minimize'; appId: AppId }
  | { type: 'focus'; appId: AppId }
  | { type: 'restore'; appId: AppId }
  | { type: 'toggle-maximize'; appId: AppId }
  | { type: 'merge-payload'; appId: AppId; payload: WindowPayload }
  | { type: 'move'; appId: AppId; x: number; y: number }
  | { type: 'resize'; appId: AppId; width: number; height: number }
  | { type: 'viewport'; area: WorkArea }

function getWorkArea(): WorkArea {
  return {
    width: Math.max(720, window.innerWidth),
    height: Math.max(480, window.innerHeight - TASKBAR_HEIGHT),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function updateWindow(
  state: WindowState,
  appId: AppId,
  updater: (window: WindowInstance) => WindowInstance,
): WindowState {
  return {
    ...state,
    windows: state.windows.map((entry) => (entry.appId === appId ? updater(entry) : entry)),
  }
}

function reducer(state: WindowState, action: WindowAction): WindowState {
  switch (action.type) {
    case 'open':
      return {
        windows: [...state.windows.filter((entry) => entry.appId !== action.instance.appId), action.instance],
        topZ: action.instance.z,
      }
    case 'close':
      return { ...state, windows: state.windows.filter((entry) => entry.appId !== action.appId) }
    case 'close-all':
      return { ...state, windows: [] }
    case 'minimize-all':
      return { ...state, windows: state.windows.map((entry) => ({ ...entry, minimized: true })) }
    case 'minimize':
      return updateWindow(state, action.appId, (entry) => ({ ...entry, minimized: true }))
    case 'focus': {
      const target = state.windows.find((entry) => entry.appId === action.appId)
      if (!target) return state
      const z = state.topZ + 1
      return {
        topZ: z,
        windows: state.windows.map((entry) =>
          entry.appId === action.appId ? { ...entry, z, minimized: false } : entry,
        ),
      }
    }
    case 'restore': {
      const z = state.topZ + 1
      return {
        topZ: z,
        windows: state.windows.map((entry) =>
          entry.appId === action.appId ? { ...entry, minimized: false, z } : entry,
        ),
      }
    }
    case 'toggle-maximize': {
      const z = state.topZ + 1
      return {
        topZ: z,
        windows: state.windows.map((entry) => {
          if (entry.appId !== action.appId) return entry
          if (entry.maximized && entry.restore) {
            return {
              ...entry,
              ...entry.restore,
              restore: undefined,
              maximized: false,
              z,
              minimized: false,
            }
          }
          return {
            ...entry,
            restore: {
              x: entry.x,
              y: entry.y,
              width: entry.width,
              height: entry.height,
            },
            maximized: true,
            z,
            minimized: false,
          }
        }),
      }
    }
    case 'merge-payload': {
      const z = state.topZ + 1
      return {
        topZ: z,
        windows: state.windows.map((entry) =>
          entry.appId === action.appId
            ? {
                ...entry,
                payload: { ...entry.payload, ...action.payload },
                z,
                minimized: false,
              }
            : entry,
        ),
      }
    }
    case 'move':
      return updateWindow(state, action.appId, (entry) =>
        entry.maximized ? entry : { ...entry, x: action.x, y: action.y },
      )
    case 'resize':
      return updateWindow(state, action.appId, (entry) =>
        entry.maximized
          ? entry
          : {
              ...entry,
              width: Math.max(APP_META[entry.appId].minSize.width, action.width),
              height: Math.max(APP_META[entry.appId].minSize.height, action.height),
            },
      )
    case 'viewport':
      return {
        ...state,
        windows: state.windows.map((entry) => {
          if (entry.maximized) return entry
          const maxWidth = action.area.width - 16
          const maxHeight = action.area.height - 16
          const width = Math.min(entry.width, maxWidth)
          const height = Math.min(entry.height, maxHeight)
          return {
            ...entry,
            width,
            height,
            x: clamp(entry.x, 0, Math.max(0, action.area.width - width)),
            y: clamp(entry.y, 0, Math.max(0, action.area.height - height)),
          }
        }),
      }
  }
}

interface WindowContextValue {
  windows: WindowInstance[]
  openApp: (appId: AppId, payload?: WindowPayload) => void
  activateApp: (appId: AppId, payload?: WindowPayload) => void
  showApp: (appId: AppId, payload?: WindowPayload) => void
  closeApp: (appId: AppId) => void
  closeAllApps: () => void
  minimizeAllApps: () => void
  minimizeApp: (appId: AppId) => void
  focusApp: (appId: AppId) => void
  toggleMaximize: (appId: AppId) => void
  moveWindow: (appId: AppId, x: number, y: number) => void
  resizeWindow: (appId: AppId, width: number, height: number) => void
  topAppId: AppId | null
}

const WindowContext = createContext<WindowContextValue | null>(null)

export function WindowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { windows: [], topZ: 10 })

  useEffect(() => {
    const handleResize = () => dispatch({ type: 'viewport', area: getWorkArea() })
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const openApp = useCallback((appId: AppId, payload?: WindowPayload) => {
    const meta = APP_META[appId]
    const area = getWorkArea()
    const width = Math.min(meta.defaultSize.width, area.width - 32)
    const height = Math.min(meta.defaultSize.height, area.height - 24)
    const cascade = state.windows.length % 6
    const offset = 18 + cascade * 26
    const x = Math.round((area.width - width) / 2) + offset
    const y = Math.max(8, Math.round((area.height - height) / 2) - 4 + cascade * 18)

    dispatch({
      type: 'open',
      instance: {
        appId,
        x: Math.min(x, area.width - width - 8),
        y: Math.min(y, area.height - height - 8),
        width,
        height,
        z: state.topZ + 1,
        minimized: false,
        maximized: false,
        payload,
      },
    })
  }, [state.topZ, state.windows.length])

  const activateApp = useCallback(
    (appId: AppId, payload?: WindowPayload) => {
      const existing = state.windows.find((entry) => entry.appId === appId)
      if (!existing) {
        openApp(appId, payload)
        return
      }
      if (payload) {
        dispatch({ type: 'merge-payload', appId, payload })
        return
      }
      if (existing.minimized) {
        dispatch({ type: 'restore', appId })
        return
      }
      const highestZ = Math.max(...state.windows.map((entry) => entry.z))
      if (existing.z === highestZ) {
        dispatch({ type: 'minimize', appId })
        return
      }
      dispatch({ type: 'focus', appId })
    },
    [openApp, state.windows],
  )

  const showApp = useCallback(
    (appId: AppId, payload?: WindowPayload) => {
      const existing = state.windows.find((entry) => entry.appId === appId)
      if (!existing) {
        openApp(appId, payload)
        return
      }
      if (payload) {
        dispatch({ type: 'merge-payload', appId, payload })
        return
      }
      dispatch({ type: 'focus', appId })
    },
    [openApp, state.windows],
  )

  const closeApp = useCallback((appId: AppId) => dispatch({ type: 'close', appId }), [])
  const closeAllApps = useCallback(() => dispatch({ type: 'close-all' }), [])
  const minimizeAllApps = useCallback(() => dispatch({ type: 'minimize-all' }), [])
  const minimizeApp = useCallback((appId: AppId) => dispatch({ type: 'minimize', appId }), [])
  const focusApp = useCallback((appId: AppId) => dispatch({ type: 'focus', appId }), [])
  const toggleMaximize = useCallback(
    (appId: AppId) => dispatch({ type: 'toggle-maximize', appId }),
    [],
  )
  const moveWindow = useCallback(
    (appId: AppId, x: number, y: number) => dispatch({ type: 'move', appId, x, y }),
    [],
  )
  const resizeWindow = useCallback(
    (appId: AppId, width: number, height: number) =>
      dispatch({ type: 'resize', appId, width, height }),
    [],
  )

  const topAppId = useMemo(() => {
    const visible = state.windows.filter((entry) => !entry.minimized)
    if (!visible.length) return null
    return visible.reduce((top, entry) => (entry.z > top.z ? entry : top)).appId
  }, [state.windows])

  const value = useMemo<WindowContextValue>(
    () => ({
      windows: state.windows,
      openApp,
      activateApp,
      showApp,
      closeApp,
      closeAllApps,
      minimizeAllApps,
      minimizeApp,
      focusApp,
      toggleMaximize,
      moveWindow,
      resizeWindow,
      topAppId,
    }),
    [
      state.windows,
      openApp,
      activateApp,
      showApp,
      closeApp,
      closeAllApps,
      minimizeAllApps,
      minimizeApp,
      focusApp,
      toggleMaximize,
      moveWindow,
      resizeWindow,
      topAppId,
    ],
  )

  return <WindowContext.Provider value={value}>{children}</WindowContext.Provider>
}

export function useWindows(): WindowContextValue {
  const context = useContext(WindowContext)
  if (!context) throw new Error('useWindows must be used inside WindowProvider')
  return context
}
