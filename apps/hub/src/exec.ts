import { spawn } from 'node:child_process'
import type { ServerConfig } from './servers'
import { getConnection } from './ssh'

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

/** Run `tmux <argv>` locally with no shell (argv array — injection-safe). */
export function runLocalTmux(argv: string[]): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn('tmux', argv, { env: process.env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', (err) => resolve({ code: 127, stdout, stderr: `${stderr}${String(err)}` }))
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }))
  })
}

/** Run a (pre-validated) shell command on a remote server over the pooled SSH connection. */
export async function runRemote(server: ServerConfig, command: string): Promise<ExecResult> {
  const conn = await getConnection(server)
  return new Promise<ExecResult>((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        // Per-channel failure — surface it; the pooled connection stays up (ssh.ts handles
        // real connection-level errors via the Client 'error'/'close' events).
        reject(err)
        return
      }
      let stdout = ''
      let stderr = ''
      stream.on('data', (d: Buffer) => (stdout += d.toString()))
      stream.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
      stream.on('close', (code: number) => resolve({ code: code ?? 0, stdout, stderr }))
      stream.on('error', reject)
    })
  })
}
