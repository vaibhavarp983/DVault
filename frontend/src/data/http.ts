export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
  formData?: FormData
  query?: Record<string, string | number | boolean | undefined | null>
  timeoutMs?: number
}

function extractDetail(payload: unknown): { message?: string; code?: string } {
  if (!payload || typeof payload !== 'object') return {}
  const envelope = payload as {
    error?: { code?: unknown; message?: unknown }
    detail?: unknown
  }
  if (envelope.error && typeof envelope.error === 'object') {
    return {
      message:
        typeof envelope.error.message === 'string' ? envelope.error.message : undefined,
      code: typeof envelope.error.code === 'string' ? envelope.error.code : undefined,
    }
  }
  const detail = envelope.detail
  if (typeof detail === 'string') return { message: detail }
  if (Array.isArray(detail)) {
    return {
      message: detail
        .map((entry) => {
          if (entry && typeof entry === 'object' && 'msg' in entry) {
            return String((entry as { msg: unknown }).msg)
          }
          return String(entry)
        })
        .join('; '),
    }
  }
  return {}
}

function withQuery(path: string, query?: RequestOptions['query']): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  const suffix = params.toString()
  return suffix ? `${path}${path.includes('?') ? '&' : '?'}${suffix}` : path
}

/**
 * Shared transport for both portal repositories.
 * Accepts the backend error envelope ({ error: { code, message } }) and FastAPI { detail }.
 */
export async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000)
  const isForm = options.formData !== undefined

  try {
    const response = await fetch(`${baseUrl}${withQuery(path, options.query)}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(!isForm && options.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      body: isForm
        ? options.formData
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
      signal: controller.signal,
    })

    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        throw new ApiError(response.status, 'The API returned a response that is not valid JSON.')
      }
    }

    if (!response.ok) {
      const detail = extractDetail(payload)
      throw new ApiError(
        response.status,
        detail.message ?? `The API rejected the request (${response.status}).`,
        detail.code,
      )
    }

    if (!payload || typeof payload !== 'object') {
      throw new ApiError(response.status, 'The API returned an empty snapshot.')
    }

    return payload as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, 'The API timed out. Check that FastAPI is running.')
    }
    throw new ApiError(
      0,
      'Could not reach the DVault API. Check VITE_API_BASE_URL and the FastAPI CORS settings.',
    )
  } finally {
    clearTimeout(timeout)
  }
}
