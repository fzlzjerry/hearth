'use client'

interface Hint {
  key: string
  label: string
}

const SIDEBAR_HINTS: Hint[] = [
  { key: '↑↓/jk', label: 'nav' },
  { key: '⏎', label: 'attach' },
  { key: 'n', label: 'new' },
  { key: 'd', label: 'kill' },
  { key: 'a', label: 'add server' },
  { key: 'x', label: 'rm server' },
  { key: '1-9', label: 'tab' },
  { key: '⌘K', label: 'jump' },
]

const TERMINAL_HINTS: Hint[] = [
  { key: '⌘B', label: 'sidebar' },
  { key: '⌘1-9', label: 'tab' },
  { key: '⌘←→', label: 'switch' },
  { key: '⌘W', label: 'close' },
  { key: '⌘K', label: 'jump' },
]

export default function StatusBar({
  focus,
  className = '',
}: {
  focus: 'sidebar' | 'terminal'
  className?: string
}) {
  const hints = focus === 'terminal' ? TERMINAL_HINTS : SIDEBAR_HINTS
  return (
    <footer
      className={`h-[22px] shrink-0 items-center gap-4 overflow-hidden border-t border-border px-3 text-[11px] ${className}`}
    >
      {hints.map((h) => (
        <span key={h.key} className="select-none whitespace-nowrap">
          <span className="text-accent">{h.key}</span> <span className="text-dim">{h.label}</span>
        </span>
      ))}
      <div className="flex-1" />
      <span className="select-none text-dimmer">{focus === 'terminal' ? 'terminal' : 'sidebar'}</span>
    </footer>
  )
}
