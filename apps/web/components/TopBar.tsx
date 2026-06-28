'use client'

import type { ConnStatus } from '@/lib/types'

interface Props {
  status: ConnStatus
  hasActiveTab: boolean
  onToggleSidebar: () => void
  onLogout: () => void
}

export default function TopBar({ status, hasActiveTab, onToggleSidebar, onLogout }: Props) {
  const dot = !hasActiveTab
    ? 'text-dimmer'
    : status === 'connected'
      ? 'text-live'
      : status === 'connecting'
        ? 'text-data'
        : 'text-danger'
  const label = !hasActiveTab
    ? 'idle'
    : status === 'connected'
      ? 'connected'
      : status === 'connecting'
        ? 'connecting'
        : 'disconnected'

  return (
    <header className="flex h-[30px] shrink-0 items-center gap-2 border-b border-border pr-3 pl-1 text-[12px] sm:px-3">
      <button
        className="-my-1 px-2 py-1 text-[15px] leading-none text-dim hover:text-text md:hidden"
        onClick={onToggleSidebar}
        aria-label="toggle sidebar"
      >
        ≡
      </button>
      <span className="flex items-center gap-1.5">
        <span className="select-none text-accent">›</span>
        <span className="font-bold text-accent">hearth</span>
      </span>
      {/* subtitle is decoration; reclaim the width on phones */}
      <span className="hidden text-dim sm:inline">tmux dashboard</span>
      <div className="flex-1" />
      <span className={dot}>●</span>
      {/* the dot already carries the state on phones; the word is the desktop nicety */}
      <span className="hidden text-dim sm:inline">{label}</span>
      <span className="mx-1 hidden select-none text-border sm:inline">│</span>
      <button onClick={onLogout} className="text-dimmer hover:text-text" title="log out">
        logout
      </button>
    </header>
  )
}
