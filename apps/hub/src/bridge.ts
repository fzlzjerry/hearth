import type { WebSocket } from 'ws'
import type { ClientChannel } from 'ssh2'
import type { ServerConfig } from './servers'
import { getConnection } from './ssh'
import { attachArgv, attachCommand } from './tmux'
import { env } from './env'
import { log } from './log'

export interface AttachOpts {
  server: ServerConfig
  session: string
  cols: number
  rows: number
}

/** Minimal PTY surface the WS<->PTY wiring needs, satisfied by both ssh2 and node-pty. */
interface PtyLike {
  write: (data: Buffer | string) => void
  resize: (cols: number, rows: number) => void
  onData: (cb: (chunk: Buffer) => void) => void
  onClose: (cb: () => void) => void
  kill: () => void
}

export async function bridge(socket: WebSocket, opts: AttachOpts): Promise<void> {
  return opts.server.local ? bridgeLocal(socket, opts) : bridgeRemote(socket, opts)
}

async function bridgeRemote(socket: WebSocket, opts: AttachOpts): Promise<void> {
  const { server, session, cols, rows } = opts
  let conn
  try {
    conn = await getConnection(server)
  } catch (err) {
    log.warn({ server: server.id, err: String(err) }, 'ssh connect failed')
    safeClose(socket, 1011, 'ssh connect failed')
    return
  }

  // The SSH handshake can take seconds; if the client gave up meanwhile, don't open a channel.
  if (socket.readyState !== socket.OPEN) return

  conn.exec(
    attachCommand(session),
    { pty: { term: 'xterm-256color', rows, cols } },
    (err, stream: ClientChannel) => {
      if (err) {
        // Per-channel failure (e.g. MaxSessions) — close this socket only; leave the pooled
        // connection intact (ssh.ts tears it down on real connection-level 'error'/'close').
        log.warn({ server: server.id, err: String(err) }, 'tmux exec failed')
        safeClose(socket, 1011, 'exec failed')
        return
      }
      wire(socket, {
        write: (d) => void stream.write(d),
        resize: (c, r) => stream.setWindow(r, c, 0, 0), // ssh2: (rows, cols, height, width)
        onData: (cb) => {
          stream.on('data', cb)
          stream.stderr.on('data', cb)
        },
        onClose: (cb) => stream.on('close', cb),
        kill: () => {
          try {
            stream.close()
          } catch {
            /* ignore */
          }
        },
      })
    },
  )
}

async function bridgeLocal(socket: WebSocket, opts: AttachOpts): Promise<void> {
  const { session, cols, rows } = opts
  let nodePty: typeof import('node-pty')
  try {
    nodePty = await import('node-pty')
  } catch (err) {
    log.error({ err: String(err) }, 'node-pty unavailable (install it for local servers)')
    safeClose(socket, 1011, 'node-pty unavailable')
    return
  }

  const p = nodePty.spawn('tmux', attachArgv(session), {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME,
    env: process.env as Record<string, string>,
  })

  wire(socket, {
    write: (d) => p.write(typeof d === 'string' ? d : d.toString('utf8')),
    resize: (c, r) => p.resize(c, r), // node-pty: (cols, rows)
    onData: (cb) => p.onData((s) => cb(Buffer.from(s, 'utf8'))),
    onClose: (cb) => p.onExit(() => cb()),
    kill: () => {
      try {
        p.kill()
      } catch {
        /* ignore */
      }
    },
  })
}

/** Pipe a PTY to a WebSocket: PTY data -> binary frames; binary frames -> PTY input;
 *  text frames -> JSON control (resize). Server-initiated ping keeps the link warm. */
function wire(socket: WebSocket, pty: PtyLike): void {
  // The socket may have closed during the async connect window (ssh handshake / node-pty import).
  // ws fires 'close' once and never replays it for late listeners, so if we attached now we'd
  // leak the ping interval + PTY/channel. Bail and tear the PTY down.
  if (socket.readyState !== socket.OPEN) {
    pty.kill()
    return
  }
  let closed = false

  pty.onData((chunk) => {
    if (socket.readyState === socket.OPEN) socket.send(chunk, { binary: true })
  })
  pty.onClose(() => safeClose(socket, 1000, 'pty closed'))

  socket.on('message', (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      pty.write(data)
      return
    }
    // text frame -> control message
    try {
      const msg = JSON.parse(data.toString('utf8')) as { type?: string; cols?: number; rows?: number }
      if (msg.type === 'resize' && Number.isFinite(msg.cols) && Number.isFinite(msg.rows)) {
        pty.resize(clampDim(msg.cols), clampDim(msg.rows))
      }
    } catch {
      /* ignore non-JSON text frames */
    }
  })

  const ping = setInterval(() => {
    if (socket.readyState === socket.OPEN) {
      try {
        socket.ping()
      } catch {
        /* ignore */
      }
    }
  }, env.WS_PING_MS)

  const cleanup = () => {
    if (closed) return
    closed = true
    clearInterval(ping)
    pty.kill()
  }
  socket.on('close', cleanup)
  socket.on('error', cleanup)
}

function clampDim(n: number | undefined): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(1000, Math.max(1, Math.floor(n as number)))
}

function safeClose(socket: WebSocket, code: number, reason: string): void {
  try {
    if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
      socket.close(code, reason)
    }
  } catch {
    /* ignore */
  }
}
