import { describe, expect, it, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { safeUploadName, writeUpload } from './uploads'
import type { ServerConfig } from './servers'

describe('safeUploadName', () => {
  it('strips directory components so a malicious name cannot traverse', () => {
    expect(safeUploadName('../../etc/passwd', 'image/png', 123)).toBe('123-passwd.png')
  })
  it('keeps an existing extension', () => {
    expect(safeUploadName('shot.PNG', 'image/png', 1)).toBe('1-shot.PNG')
  })
  it('replaces unsafe chars and derives the extension from the mime type', () => {
    expect(safeUploadName('my pic!', 'image/jpeg', 7)).toBe('7-my_pic_.jpeg')
  })
  it('falls back to a name when the input is empty', () => {
    expect(safeUploadName('', 'image/png', 9)).toBe('9-image.png')
  })
})

describe('writeUpload (local)', () => {
  const cleanups: string[] = []
  afterEach(async () => {
    delete process.env.HEARTH_UPLOAD_DIR
    for (const d of cleanups.splice(0)) await rm(d, { recursive: true, force: true })
  })

  it('writes the bytes to HEARTH_UPLOAD_DIR and returns the absolute path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hearth-upl-'))
    cleanups.push(dir)
    process.env.HEARTH_UPLOAD_DIR = dir
    const server = { id: 'local', name: 'l', local: true, port: 22 } as ServerConfig
    const data = Buffer.from('not-really-a-png-but-bytes')
    const { path } = await writeUpload(server, { filename: 'a.png', mime: 'image/png', data })
    expect(path.startsWith(dir)).toBe(true)
    expect(await readFile(path)).toEqual(data)
  })
})
