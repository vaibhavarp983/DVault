export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
}

function extractDetail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const detail = (payload as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((entry) => {
        if (entry && typeof entry === 'object' && 'msg' in entry) {
          return String((entry as { msg: unknown }).msg)
        }
        return String(entry)
      })
      .join('; ')
  }
  return undefined
}

/**
 * Shared JSON transport for both portal repositories.
 * FastAPI errors are expected as { "detail": "…" }.
 */
export async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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
      throw new ApiError(
        response.status,
        extractDetail(payload) ?? `The API rejected the request (${response.status}).`,
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
