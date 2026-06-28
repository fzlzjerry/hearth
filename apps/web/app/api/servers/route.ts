import { hubFetch, proxy } from '@/lib/hub'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  return proxy(() => hubFetch('/servers'))
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.text()
  return proxy(() =>
    hubFetch('/servers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  )
}
