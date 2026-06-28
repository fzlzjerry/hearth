import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { Client, type ConnectConfig } from 'ssh2'
import type { ServerConfig } from './servers'
import { log } from './log'

interface Pooled {
  conn: Client
  ready: Promise<Client>
}

/** One reusable SSH connection per server id, with keepalive + error-driven teardown. */
const pool = new Map<string, Pooled>()

function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return `${homedir()}/${p.slice(2)}`
  return p
}

function buildConnectConfig(server: ServerConfig): ConnectConfig {
  const cfg: ConnectConfig = {
    host: server.host,
    port: server.port,
    username: server.user,
    keepaliveInterval: 20_000,
    keepaliveCountMax: 3,
    readyTimeout: 20_000,
  }
  if (server.identityFile) {
    cfg.privateKey = readFileSync(expandHome(server.identityFile))
  } else if (server.password) {
    cfg.password = server.password
  }
  return cfg
}

export function getConnection(server: ServerConfig): Promise<Client> {
  const existing = pool.get(server.id)
  if (existing) return existing.ready

  const conn = new Client()
  const ready = new Promise<Client>((resolve, reject) => {
    conn.on('ready', () => {
      log.info({ server: server.id }, 'ssh ready')
      resolve(conn)
    })
    conn.on('error', (err) => {
      log.warn({ server: server.id, err: err.message }, 'ssh error')
      pool.delete(server.id)
      reject(err)
    })
    conn.on('close', () => {
      log.info({ server: server.id }, 'ssh closed')
      pool.delete(server.id)
    })
  })

  pool.set(server.id, { conn, ready })
  try {
    conn.connect(buildConnectConfig(server))
  } catch (err) {
    pool.delete(server.id)
    return Promise.reject(err)
  }
  return ready
}

export function dropConnection(id: string): void {
  const p = pool.get(id)
  if (!p) return
  try {
    p.conn.end()
  } catch {
    /* ignore */
  }
  pool.delete(id)
}
