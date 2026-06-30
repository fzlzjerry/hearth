'use client'

import type { ServerInput, ServerSummary, SessionInfo } from './types'

/** Client-side fetch helpers. Auth rides on the httpOnly session cookie (same-origin). */

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new AuthError()
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`${res.status} ${detail}`)
  }
  return res.json() as Promise<T>
}

export class AuthError extends Error {
  constructor() {
    super('unauthorized')
    this.name = 'AuthError'
  }
}

export async function fetchServers(): Promise<ServerSummary[]> {
  const res = await fetch('/api/servers', { cache: 'no-store' })
  const data = await jsonOrThrow<{ servers: ServerSummary[] }>(res)
  return data.servers ?? []
}

export async function addServer(input: ServerInput): Promise<void> {
  const res = await fetch('/api/servers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `failed (HTTP ${res.status})`)
  }
}

export async function removeServer(id: string): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await jsonOrThrow<unknown>(res)
}

export async function fetchSessions(serverId: string): Promise<SessionInfo[]> {
  const res = await fetch(`/api/servers/${encodeURIComponent(serverId)}/sessions`, { cache: 'no-store' })
  const data = await jsonOrThrow<{ sessions: SessionInfo[] }>(res)
  return data.sessions ?? []
}

export async function createSession(serverId: string, name: string): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(serverId)}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  await jsonOrThrow<unknown>(res)
}

export async function killSession(serverId: string, name: string): Promise<void> {
  const res = await fetch(
    `/api/servers/${encodeURIComponent(serverId)}/sessions/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  )
  await jsonOrThrow<unknown>(res)
}

export async function fetchPreview(serverId: string, name: string): Promise<string> {
  const res = await fetch(
    `/api/servers/${encodeURIComponent(serverId)}/sessions/${encodeURIComponent(name)}/preview`,
    { cache: 'no-store' },
  )
  const data = await jsonOrThrow<{ preview: string }>(res)
  return data.preview ?? ''
}

/** Mint a short-TTL WS token + get the hub WS origin for a direct connection. */
export async function fetchWsToken(): Promise<{ token: string; wsUrl: string }> {
  const res = await fetch('/api/token', { cache: 'no-store' })
  return jsonOrThrow<{ token: string; wsUrl: string }>(res)
}

/** Upload a pasted image to the target host; returns the absolute path written there. */
export async function uploadImage(
  serverId: string,
  payload: { filename: string; mime: string; dataBase64: string },
): Promise<{ path: string }> {
  const res = await fetch(`/api/servers/${encodeURIComponent(serverId)}/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOrThrow<{ path: string }>(res)
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST' })
}
