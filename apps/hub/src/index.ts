import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { ZodError } from 'zod'
import { env, allowedOrigins } from './env'
import { log } from './log'
import {
  loadServers,
  listServers,
  getServer,
  addServer,
  removeServer,
  DuplicateServerError,
} from './servers'
import { dropConnection } from './ssh'
import { checkRestToken, verifyWsToken } from './auth'
import { listSessions, createSession, killSession, previewSession, BadName } from './sessions'
import { isValidSessionName } from './tmux'
import { bridge } from './bridge'

function path(url: string): string {
  const i = url.indexOf('?')
  return i === -1 ? url : url.slice(0, i)
}

function clampDim(v: string | undefined, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(1000, Math.floor(n))
}

async function main(): Promise<void> {
  loadServers()

  // disableRequestLogging: the WS handshake URL carries the short-TTL token in its query string;
  // Fastify's default request logger would write that token to logs. We emit our own targeted logs.
  const app = Fastify({ loggerInstance: log, disableRequestLogging: true })
  await app.register(websocket, { options: { maxPayload: 1 << 20 } })

  // --- auth gates (global hooks; apply to all routes) ---
  // REST routes require the static bearer token; /healthz is open; /attach is gated by preValidation.
  app.addHook('onRequest', async (req, reply) => {
    const p = path(req.url)
    if (p === '/healthz' || p === '/attach') return
    if (!checkRestToken(req.headers.authorization)) {
      await reply.code(401).send({ error: 'unauthorized' })
    }
  })

  // WS handshake gate: verify Origin (CSWSH), JWT (aud:'ws' + exp), and session name — before upgrade.
  app.addHook('preValidation', async (req, reply) => {
    if (path(req.url) !== '/attach') return
    const q = req.query as { session?: string; token?: string }
    if (allowedOrigins.length > 0) {
      const origin = req.headers.origin
      if (!origin || !allowedOrigins.includes(origin)) {
        await reply.code(403).send({ error: 'forbidden origin' })
        return
      }
    }
    if (!verifyWsToken(q.token)) {
      await reply.code(401).send({ error: 'unauthorized' })
      return
    }
    if (!isValidSessionName(q.session ?? '')) {
      await reply.code(400).send({ error: 'invalid session name' })
    }
  })

  // --- REST ---
  app.get('/healthz', async () => ({ ok: true }))

  app.get('/servers', async () => ({ servers: listServers() }))

  app.post('/servers', async (req, reply) => {
    try {
      const server = addServer(req.body)
      return reply.code(201).send({ server })
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'invalid server', issues: err.issues })
      }
      if (err instanceof DuplicateServerError) {
        return reply.code(409).send({ error: err.message })
      }
      req.log.warn({ err: String(err) }, 'add server failed')
      return reply.code(500).send({ error: 'failed to add server' })
    }
  })

  app.delete<{ Params: { id: string } }>('/servers/:id', async (req, reply) => {
    const ok = removeServer(req.params.id)
    if (!ok) return reply.code(404).send({ error: 'no such server' })
    dropConnection(req.params.id)
    return { ok: true }
  })

  app.get<{ Params: { id: string } }>('/servers/:id/sessions', async (req, reply) => {
    const server = getServer(req.params.id)
    if (!server) return reply.code(404).send({ error: 'no such server' })
    try {
      return { sessions: await listSessions(server) }
    } catch (err) {
      req.log.warn({ err: String(err) }, 'list sessions failed')
      return reply.code(502).send({ error: 'failed to reach server', sessions: [] })
    }
  })

  app.post<{ Params: { id: string }; Body: { name?: string } }>(
    '/servers/:id/sessions',
    async (req, reply) => {
      const server = getServer(req.params.id)
      if (!server) return reply.code(404).send({ error: 'no such server' })
      const name = req.body?.name ?? ''
      if (!isValidSessionName(name)) return reply.code(400).send({ error: 'invalid session name' })
      try {
        await createSession(server, name)
        return reply.code(201).send({ ok: true, name })
      } catch (err) {
        if (err instanceof BadName) return reply.code(400).send({ error: 'invalid session name' })
        req.log.warn({ err: String(err) }, 'create session failed')
        return reply.code(502).send({ error: 'failed to create session' })
      }
    },
  )

  app.delete<{ Params: { id: string; name: string } }>(
    '/servers/:id/sessions/:name',
    async (req, reply) => {
      const server = getServer(req.params.id)
      if (!server) return reply.code(404).send({ error: 'no such server' })
      if (!isValidSessionName(req.params.name)) return reply.code(400).send({ error: 'invalid session name' })
      try {
        await killSession(server, req.params.name)
        return { ok: true }
      } catch (err) {
        req.log.warn({ err: String(err) }, 'kill session failed')
        return reply.code(502).send({ error: 'failed to kill session' })
      }
    },
  )

  app.get<{ Params: { id: string; name: string } }>(
    '/servers/:id/sessions/:name/preview',
    async (req, reply) => {
      const server = getServer(req.params.id)
      if (!server) return reply.code(404).send({ error: 'no such server' })
      if (!isValidSessionName(req.params.name)) return reply.code(400).send({ error: 'invalid session name' })
      try {
        return { preview: await previewSession(server, req.params.name) }
      } catch (err) {
        req.log.warn({ err: String(err) }, 'preview failed')
        return reply.code(502).send({ error: 'failed to capture pane' })
      }
    },
  )

  // --- WS terminal bridge ---
  app.get('/attach', { websocket: true }, (socket, req) => {
    const q = req.query as { server?: string; session?: string; cols?: string; rows?: string }
    const server = getServer(q.server ?? '')
    if (!server) {
      socket.close(1008, 'no such server')
      return
    }
    void bridge(socket, {
      server,
      session: q.session ?? '',
      cols: clampDim(q.cols, 80),
      rows: clampDim(q.rows, 24),
    })
  })

  await app.listen({ port: env.PORT, host: env.HOST })
  log.info({ host: env.HOST, port: env.PORT }, 'hearthd listening')
}

main().catch((err) => {
  log.error({ err: String(err) }, 'hearthd failed to start')
  process.exit(1)
})
