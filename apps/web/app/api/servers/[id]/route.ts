import { hubFetch, proxy } from '@/lib/hub'

export const runtime = 'nodejs'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return proxy(() => hubFetch(`/servers/${encodeURIComponent(id)}`, { method: 'DELETE' }))
}
