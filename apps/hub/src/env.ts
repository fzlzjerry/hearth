import 'dotenv/config'
import { z } from 'zod'

const EnvSchema = z.object({
  // Secure-by-default: bind loopback only (the Cloudflare Tunnel reaches it; nothing else should).
  // Set HOST=0.0.0.0 explicitly to expose on all interfaces.
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(8080),
  /** Static bearer token the Next.js server uses for REST calls. Never reaches the browser. */
  HEARTH_TOKEN: z.string().min(16, 'must be at least 16 chars'),
  /** Shared HMAC secret used to verify short-TTL WS JWTs minted by the web app. */
  JWT_SECRET: z.string().min(16, 'must be at least 16 chars'),
  SERVERS_FILE: z.string().default('./servers.json'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  /** Server-initiated WS ping interval (ms). Keeps idle terminals alive past Cloudflare's ~100s idle drop. */
  WS_PING_MS: z.coerce.number().int().positive().default(30000),
  /** Comma-separated allowlist of Origins permitted to open WS connections (CSWSH defense). Empty = allow any. */
  ALLOWED_ORIGIN: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('[hearthd] invalid environment:')
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }
  return parsed.data
}

export const env: Env = loadEnv()

export const allowedOrigins: string[] = (env.ALLOWED_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
