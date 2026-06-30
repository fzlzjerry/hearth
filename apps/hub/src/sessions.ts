import { homedir } from 'node:os'
import type { ServerConfig } from './servers'
import { runLocalTmux, runRemote } from './exec'
import * as tmux from './tmux'

export class BadName extends Error {
  constructor() {
    super('invalid session name')
    this.name = 'BadName'
  }
}

function assertName(name: string): void {
  if (!tmux.isValidSessionName(name)) throw new BadName()
}

export async function listSessions(server: ServerConfig): Promise<tmux.SessionInfo[]> {
  // tmux exits non-zero when no server is running yet -> treat as zero sessions.
  const res = server.local
    ? await runLocalTmux(tmux.listArgv())
    : await runRemote(server, `${tmux.listCommand()} 2>/dev/null || true`)
  return tmux.parseSessions(res.stdout)
}

export async function createSession(server: ServerConfig, name: string): Promise<void> {
  assertName(name)
  // Pin new sessions to ~ (or the server's configured cwd), matching the attach path in bridge.ts.
  if (server.local) await runLocalTmux(tmux.newDetachedArgv(name, server.cwd ?? homedir()))
  else await runRemote(server, tmux.newDetachedCommand(name, server.cwd))
}

export async function killSession(server: ServerConfig, name: string): Promise<void> {
  assertName(name)
  if (server.local) await runLocalTmux(tmux.killArgv(name))
  else await runRemote(server, tmux.killCommand(name))
}

export async function previewSession(server: ServerConfig, name: string): Promise<string> {
  assertName(name)
  const res = server.local
    ? await runLocalTmux(tmux.captureArgv(name))
    : await runRemote(server, tmux.captureCommand(name))
  return res.stdout
}
