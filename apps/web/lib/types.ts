export interface ServerSummary {
  id: string
  name: string
  host: string
  user: string
  local: boolean
}

export interface SessionInfo {
  name: string
  windows: number
  attached: boolean
}

export interface ServerInput {
  id: string
  name: string
  host?: string
  port?: number
  user?: string
  identityFile?: string
  password?: string
  local?: boolean
}

export interface OpenTab {
  /** `${serverId}:${session}` */
  id: string
  serverId: string
  serverName: string
  session: string
}

export type ConnStatus = 'connecting' | 'connected' | 'disconnected'

/** Imperative handle a terminal exposes so the touch key bar can drive it. */
export interface TermInputApi {
  /** Write a raw sequence to the terminal as if typed (routes through the WS). */
  input: (data: string) => void
  /** Refocus the terminal so the soft keyboard stays up. */
  focus: () => void
}

/** A flattened, keyboard-navigable sidebar row. */
export type NavRow =
  | { kind: 'server'; serverId: string }
  | { kind: 'session'; serverId: string; session: string; info: SessionInfo }
