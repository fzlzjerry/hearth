'use client'

import { useMemo } from 'react'
import type { NavRow, ServerSummary, SessionInfo } from '@/lib/types'

interface Props {
  servers: ServerSummary[]
  sessionsByServer: Record<string, SessionInfo[] | undefined>
  expanded: Set<string>
  navRows: NavRow[]
  selectedIndex: number
  paneFocused: boolean
  loading: boolean
  error: string | null
  onRowClick: (index: number) => void
  onRefresh: () => void
  onAddServer: () => void
}

export default function Sidebar({
  servers,
  sessionsByServer,
  expanded,
  navRows,
  selectedIndex,
  paneFocused,
  loading,
  error,
  onRowClick,
  onRefresh,
  onAddServer,
}: Props) {
  const serverById = useMemo(() => {
    const m = new Map<string, ServerSummary>()
    for (const s of servers) m.set(s.id, s)
    return m
  }, [servers])

  return (
    <nav className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex select-none items-center gap-2 px-2 py-1 text-[11px] text-dim">
        <span>servers</span>
        <span className="flex-1 overflow-hidden text-dimmer">{'─'.repeat(60)}</span>
        <button onClick={onAddServer} className="-my-1 shrink-0 px-1 py-1 text-accent hover:text-sel-text" title="add server (a)">
          + add
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-1 text-[12px] text-dim">loading…</div>
        ) : error ? (
          <div className="px-3 py-1 text-[12px] text-danger">✗ {error}</div>
        ) : servers.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-dim">no servers configured</div>
        ) : (
          navRows.map((row, i) => {
            const selected = i === selectedIndex
            const base =
              'flex h-9 md:h-6 w-full cursor-pointer items-center border-l-2 pr-2 text-left text-[13px] leading-none'
            // bright cursor when the sidebar pane has focus; dimmed when focus is in the terminal
            const sel = selected
              ? paneFocused
                ? 'border-accent bg-sel-bg text-sel-text'
                : 'border-dimmer bg-sel-bg/40 text-text'
              : 'border-transparent text-text hover:bg-sel-bg/40'

            if (row.kind === 'server') {
              const srv = serverById.get(row.serverId)
              const count = sessionsByServer[row.serverId]?.length ?? 0
              const open = expanded.has(row.serverId)
              return (
                <button key={`s:${row.serverId}`} className={`${base} ${sel} pl-2`} onClick={() => onRowClick(i)}>
                  <span className="mr-1 w-3 select-none text-dim">{open ? '▾' : '▸'}</span>
                  <span className="truncate">{srv?.name ?? row.serverId}</span>
                  <span className="flex-1" />
                  <span className="text-dimmer">[{count}]</span>
                </button>
              )
            }

            const info = row.info
            return (
              <button
                key={`t:${row.serverId}:${row.session}`}
                className={`${base} ${sel} pl-6`}
                onClick={() => onRowClick(i)}
              >
                <span className={`mr-2 select-none ${info.attached ? 'text-live' : 'text-dimmer'}`}>
                  {info.attached ? '●' : '○'}
                </span>
                <span className="truncate">{row.session}</span>
                <span className="flex-1" />
                <span className="text-dimmer">[{info.windows}]</span>
              </button>
            )
          })
        )}
      </div>
      <div className="flex items-center justify-between border-t border-border px-2 py-1 text-[11px] text-dimmer">
        <span>{servers.length} server{servers.length === 1 ? '' : 's'}</span>
        <button onClick={onRefresh} className="-my-1 px-1 py-1 hover:text-text" title="refresh (r)">
          ⟳ refresh
        </button>
      </div>
    </nav>
  )
}
