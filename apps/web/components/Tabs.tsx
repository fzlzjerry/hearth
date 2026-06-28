'use client'

import { Fragment } from 'react'
import type { ConnStatus, OpenTab } from '@/lib/types'

interface Props {
  tabs: OpenTab[]
  activeId: string | null
  status: Record<string, ConnStatus>
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

const DOT: Record<ConnStatus, string> = {
  connected: 'text-live',
  connecting: 'text-data',
  disconnected: 'text-danger',
}

export default function Tabs({ tabs, activeId, status, onActivate, onClose, onNew }: Props) {
  return (
    <div className="flex h-[26px] shrink-0 items-stretch overflow-x-auto border-b border-border px-2 text-[12px]">
      {tabs.map((tab, i) => {
        const active = tab.id === activeId
        return (
          <Fragment key={tab.id}>
            {i > 0 ? <span className="flex select-none items-center px-1 text-border">│</span> : null}
            {/* accent ink-bar on the bottom edge marks the active tab (same accent-edge language as the sidebar cursor) */}
            <span className={`group -mb-px flex items-center border-b-2 ${active ? 'border-accent' : 'border-transparent'}`}>
              <button
                onClick={() => onActivate(tab.id)}
                className={`flex items-center gap-1.5 px-1 ${active ? 'text-accent' : 'text-dim hover:text-text'}`}
                title={`${tab.serverName} · ${tab.session}`}
              >
                <span className={`select-none text-[10px] ${DOT[status[tab.id] ?? 'connecting']}`}>●</span>
                {tab.session}
              </button>
              <button
                onClick={() => onClose(tab.id)}
                className="mr-1 select-none text-dimmer opacity-0 hover:text-danger group-hover:opacity-100"
                title="close tab (⌘W)"
              >
                ✕
              </button>
            </span>
          </Fragment>
        )
      })}
      {tabs.length > 0 ? <span className="flex select-none items-center px-1 text-border">│</span> : null}
      <button onClick={onNew} className="flex select-none items-center px-1 text-dim hover:text-accent" title="new session (n)">
        +
      </button>
    </div>
  )
}
