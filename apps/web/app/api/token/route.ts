import { isAuthenticated, signWsToken } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  if (!(await isAuthenticated())) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const wsUrl = process.env.HEARTH_WS_URL
  if (!wsUrl) {
    return Response.json({ error: 'HEARTH_WS_URL not set' }, { status: 500 })
  }
  return Response.json({ token: await signWsToken(), wsUrl: wsUrl.replace(/\/$/, '') })
}
