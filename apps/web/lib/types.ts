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

/** A flattened, keyboard-navigable sidebar row. */
export type NavRow =
  | { kind: 'server'; serverId: string }
  | { kind: 'session'; serverId: string; session: string; info: SessionInfo }
