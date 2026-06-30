/**
 * tmux command builders + the session-name allowlist.
 *
 * SECURITY: a session name flows into a remote login shell on the SSH path
 * (`tmux new-session -s <name>`), so an unvalidated name is remote code execution.
 * Every entry point MUST call `isValidSessionName` BEFORE building a command.
 * The local path uses argv arrays (no shell) but keeps the same allowlist.
 */
export const SESSION_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/

export function isValidSessionName(name: string): boolean {
  return SESSION_NAME_RE.test(name)
}

/** POSIX single-quote escape, for the remote (shell) command strings. */
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export const LIST_FORMAT = '#{session_name}|#{session_windows}|#{session_attached}'

// `-c <dir>` pins a NEW session's start directory; tmux ignores it when -A attaches an existing one.
// argv form: the caller passes an already-resolved absolute path (no shell, so no ~ / $HOME expansion).
const startDirArgv = (cwd?: string): string[] => (cwd ? ['-c', cwd] : [])
// shell form: only emitted when explicitly configured. With no `-c`, a remote `ssh exec` of tmux runs
// from the SSH login directory (the user's home), so the default already lands in ~ — we avoid passing
// a literal "$HOME" that a non-expanding exec shell could turn into a bogus directory name.
const startDirShell = (cwd?: string): string => (cwd ? ` -c ${shq(cwd)}` : '')

// ---- argv forms (local node-pty / child_process — no shell) ----
export const attachArgv = (name: string, cwd?: string): string[] => [
  'new-session',
  '-A',
  '-s',
  name,
  ...startDirArgv(cwd),
]
export const listArgv = (): string[] => ['list-sessions', '-F', LIST_FORMAT]
export const newDetachedArgv = (name: string, cwd?: string): string[] => [
  'new-session',
  '-d',
  '-s',
  name,
  ...startDirArgv(cwd),
]
export const killArgv = (name: string): string[] => ['kill-session', '-t', name]
export const captureArgv = (name: string): string[] => ['capture-pane', '-p', '-t', name]

// ---- shell-command forms (remote ssh exec) — name MUST be pre-validated ----
export const attachCommand = (name: string, cwd?: string): string =>
  `tmux new-session -A -s ${shq(name)}${startDirShell(cwd)}`
export const listCommand = (): string => `tmux list-sessions -F ${shq(LIST_FORMAT)}`
export const newDetachedCommand = (name: string, cwd?: string): string =>
  `tmux new-session -d -s ${shq(name)}${startDirShell(cwd)}`
export const killCommand = (name: string): string => `tmux kill-session -t ${shq(name)}`
export const captureCommand = (name: string): string => `tmux capture-pane -p -t ${shq(name)}`

export interface SessionInfo {
  name: string
  windows: number
  attached: boolean
}

export function parseSessions(output: string): SessionInfo[] {
  return output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', windows = '0', attached = '0'] = line.split('|')
      return { name, windows: Number(windows) || 0, attached: attached !== '0' }
    })
    .filter((s) => s.name.length > 0)
}
