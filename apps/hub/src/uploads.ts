/**
 * Pasted-image uploads. Claude Code (and most CLIs) cannot receive clipboard image bytes over a
 * remote PTY — the documented remote path is a file path typed into the prompt. So we land the image
 * on the target host under ~/.hearth/uploads/ and hand back its absolute path; the web client then
 * types that path into the terminal.
 *
 *   local server  -> write with fs to the hub user's home
 *   remote server -> write over SFTP on the pooled SSH connection (paths resolve against the SSH home)
 */
import { homedir } from 'node:os'
import { mkdir, writeFile, readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { SFTPWrapper } from 'ssh2'
import type { ServerConfig } from './servers'
import { getConnection } from './ssh'
import { log } from './log'

const UPLOAD_DIR = '.hearth/uploads'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // best-effort retention: prune uploads older than a week

export interface UploadInput {
  filename: string
  mime: string
  data: Buffer
}

/** Derive a safe, collision-resistant basename: strip directories, allowlist chars, ensure an ext. */
export function safeUploadName(filename: string, mime: string, stamp: number): string {
  const base = (filename || '').split(/[\\/]/).pop() ?? ''
  let name = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._]+/, '')
  if (!name) name = 'image'
  if (!/\.[A-Za-z0-9]+$/.test(name)) {
    const ext = (mime.split('/')[1] ?? 'png').replace(/[^A-Za-z0-9]/g, '') || 'png'
    name = `${name}.${ext}`
  }
  return `${stamp}-${name}`
}

export async function writeUpload(server: ServerConfig, input: UploadInput): Promise<{ path: string }> {
  const name = safeUploadName(input.filename, input.mime, Date.now())
  return server.local ? writeLocal(name, input.data) : writeRemote(server, name, input.data)
}

async function writeLocal(name: string, data: Buffer): Promise<{ path: string }> {
  const dir = join(homedir(), UPLOAD_DIR)
  await mkdir(dir, { recursive: true })
  const full = join(dir, name)
  await writeFile(full, data)
  void pruneLocal(dir)
  return { path: full }
}

async function pruneLocal(dir: string): Promise<void> {
  try {
    const now = Date.now()
    for (const f of await readdir(dir)) {
      const p = join(dir, f)
      try {
        const s = await stat(p)
        if (now - s.mtimeMs > MAX_AGE_MS) await unlink(p)
      } catch {
        /* ignore individual file errors */
      }
    }
  } catch {
    /* best-effort */
  }
}

async function writeRemote(server: ServerConfig, name: string, data: Buffer): Promise<{ path: string }> {
  const conn = await getConnection(server)
  const sftp = await new Promise<SFTPWrapper>((resolve, reject) =>
    conn.sftp((err, s) => (err ? reject(err) : resolve(s))),
  )
  try {
    // SFTP relative paths resolve against the user's home; mkdir is non-recursive so create both levels.
    await sftpMkdir(sftp, '.hearth')
    await sftpMkdir(sftp, UPLOAD_DIR)
    const rel = `${UPLOAD_DIR}/${name}`
    await new Promise<void>((resolve, reject) =>
      sftp.writeFile(rel, data, (err) => (err ? reject(err) : resolve())),
    )
    const abs = await new Promise<string>((resolve, reject) =>
      sftp.realpath(rel, (err, p) => (err ? reject(err) : resolve(p))),
    )
    await pruneRemote(sftp, UPLOAD_DIR)
    return { path: abs }
  } finally {
    try {
      sftp.end()
    } catch {
      /* ignore */
    }
  }
}

/** Create a directory, treating "already exists" (and any other error) as a no-op. */
function sftpMkdir(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve) => sftp.mkdir(path, () => resolve()))
}

async function pruneRemote(sftp: SFTPWrapper, dir: string): Promise<void> {
  try {
    const list = await new Promise<Array<{ filename: string; attrs: { mtime: number } }>>(
      (resolve, reject) => sftp.readdir(dir, (err, l) => (err ? reject(err) : resolve(l as never))),
    )
    const cutoffSec = (Date.now() - MAX_AGE_MS) / 1000
    for (const ent of list) {
      if ((ent.attrs?.mtime ?? Infinity) < cutoffSec) {
        await new Promise<void>((resolve) => sftp.unlink(`${dir}/${ent.filename}`, () => resolve()))
      }
    }
  } catch (err) {
    log.debug?.({ err: String(err) }, 'remote upload prune skipped')
  }
}
