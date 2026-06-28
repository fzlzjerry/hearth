import { hubFetch, proxy } from '@/lib/hub'

export const runtime = 'nodejs'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
): Promise<Response> {
  const { id, name } = await params
  return proxy(() =>
    hubFetch(`/servers/${encodeURIComponent(id)}/sessions/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  )
}
