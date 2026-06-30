import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { env } from './env'
import { log } from './log'

const ServerSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]+$/, 'id must be [A-Za-z0-9_-]'),
    name: z.string().min(1),
    host: z.string().optional(),
    port: z.number().int().positive().default(22),
    user: z.string().optional(),
    identityFile: z.string().optional(),
    password: z.string().optional(),
    local: z.boolean().default(false),
    // Optional start directory for new tmux sessions. Must be absolute: it is passed to `tmux -c`
    // either as an argv element (local, no shell) or single-quoted (remote), so ~ / $HOME would NOT
    // expand. Omit to use the default (local: the service user's home; remote: the SSH login dir).
    cwd: z.string().regex(/^\//, 'cwd must be an absolute path').optional(),
  })
  .refine((s) => s.local || (!!s.host && !!s.user), {
    message: 'remote server requires host and user',
  })

export type ServerConfig = z.infer<typeof ServerSchema>

const ServersSchema = z.array(ServerSchema)

/** Public view of a server — never includes credentials. */
export interface ServerSummary {
  id: string
  name: string
  host: string
  user: string
  local: boolean
}

let servers: ServerConfig[] = []

export function loadServers(): ServerConfig[] {
  try {
    const raw = readFileSync(env.SERVERS_FILE, 'utf8')
    servers = ServersSchema.parse(JSON.parse(raw))
    const ids = new Set<string>()
    for (const s of servers) {
      if (ids.has(s.id)) throw new Error(`duplicate server id "${s.id}"`)
      ids.add(s.id)
    }
    log.info({ count: servers.length, file: env.SERVERS_FILE }, 'loaded servers')
  } catch (err) {
    log.error({ err: String(err), file: env.SERVERS_FILE }, 'failed to load servers')
    servers = []
  }
  return servers
}

export function listServers(): ServerSummary[] {
  return servers.map(toSummary)
}

export function getServer(id: string): ServerConfig | undefined {
  return servers.find((s) => s.id === id)
}

/** Validate + parse an untrusted server payload (throws ZodError on invalid). */
export function parseServerInput(input: unknown): ServerConfig {
  return ServerSchema.parse(input)
}

export class DuplicateServerError extends Error {
  constructor(id: string) {
    super(`server id "${id}" already exists`)
    this.name = 'DuplicateServerError'
  }
}

/** Add a server and persist the inventory. Returns the public summary. */
export function addServer(input: unknown): ServerSummary {
  const cfg = parseServerInput(input)
  if (servers.some((s) => s.id === cfg.id)) throw new DuplicateServerError(cfg.id)
  servers.push(cfg)
  saveServers()
  log.info({ server: cfg.id }, 'added server')
  return toSummary(cfg)
}

/** Remove a server by id and persist. Returns false if it didn't exist. */
export function removeServer(id: string): boolean {
  const i = servers.findIndex((s) => s.id === id)
  if (i === -1) return false
  servers.splice(i, 1)
  saveServers()
  log.info({ server: id }, 'removed server')
  return true
}

function toSummary(s: ServerConfig): ServerSummary {
  return {
    id: s.id,
    name: s.name,
    host: s.local ? 'local' : (s.host ?? ''),
    user: s.local ? '' : (s.user ?? ''),
    local: s.local,
  }
}

function saveServers(): void {
  writeFileSync(env.SERVERS_FILE, `${JSON.stringify(servers, null, 2)}\n`, 'utf8')
}
