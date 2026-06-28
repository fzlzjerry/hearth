import { createHash, timingSafeEqual } from 'node:crypto'
import { signSession, setSessionCookie } from '@/lib/server-auth'

export const runtime = 'nodejs'

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.DASHBOARD_PASSWORD
  if (!expected) {
    return Response.json({ error: 'server not configured' }, { status: 500 })
  }
  const body = (await req.json().catch(() => ({}))) as { password?: unknown }
  const password = typeof body.password === 'string' ? body.password : ''
  if (!password || !safeEqual(password, expected)) {
    return Response.json({ error: 'invalid password' }, { status: 401 })
  }
  await setSessionCookie(await signSession())
  return Response.json({ ok: true })
}
