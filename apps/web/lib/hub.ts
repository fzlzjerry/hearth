import { isAuthenticated } from './server-auth'

/** Server-only proxy to hearthd. Injects the static HEARTH_TOKEN so the browser never sees it. */
function hubBase(): string {
  const url = process.env.HEARTH_HTTP_URL
  if (!url) throw new Error('HEARTH_HTTP_URL is not set')
  return url.replace(/\/$/, '')
}

export async function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.HEARTH_TOKEN
  if (!token) throw new Error('HEARTH_TOKEN is not set')
  return fetch(`${hubBase()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  })
}

/**
 * Guard a route handler: 401 unless the session cookie is valid, otherwise run `fn`,
 * proxying hearthd's status + JSON straight through.
 */
export async function proxy(
  fn: () => Promise<Response>,
): Promise<Response> {
  if (!(await isAuthenticated())) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const res = await fn()
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    })
  } catch (err) {
    return Response.json(
      { error: 'hub unreachable', detail: String(err) },
      { status: 502 },
    )
  }
}
