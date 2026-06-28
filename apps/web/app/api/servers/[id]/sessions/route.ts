import { hubFetch, proxy } from '@/lib/hub'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return proxy(() => hubFetch(`/servers/${encodeURIComponent(id)}/sessions`))
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  const body = await req.text()
  return proxy(() =>
    hubFetch(`/servers/${encodeURIComponent(id)}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  )
}
