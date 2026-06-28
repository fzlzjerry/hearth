import { createHash, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from './env'

/** Constant-time string compare via fixed-length SHA-256 digests. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/** REST: `Authorization: Bearer <HEARTH_TOKEN>` (the static service token). */
export function checkRestToken(header: string | undefined): boolean {
  if (!header) return false
  const m = /^Bearer\s+(.+)$/i.exec(header)
  if (!m?.[1]) return false
  return safeEqual(m[1], env.HEARTH_TOKEN)
}

export interface WsClaims {
  sub?: string
  aud?: string | string[]
  exp?: number
}

/** WS: short-TTL JWT minted by the web app, must carry `aud:'ws'` and a valid `exp`. */
export function verifyWsToken(token: string | undefined): WsClaims | null {
  if (!token) return null
  try {
    return jwt.verify(token, env.JWT_SECRET, { audience: 'ws' }) as WsClaims
  } catch {
    return null
  }
}
