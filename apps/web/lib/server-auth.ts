import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'hearth_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12h

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(s)
}

/** Long-lived session token, stored as an httpOnly cookie. Gates the UI + REST proxy. */
export async function signSession(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('dashboard')
    .setAudience('session')
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret())
}

/** Short-TTL token the browser appends to the direct WSS connection to hearthd. */
export async function signWsToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('dashboard')
    .setAudience('ws')
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(secret())
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return false
  try {
    await jwtVerify(token, secret(), { audience: 'session' })
    return true
  } catch {
    return false
  }
}
