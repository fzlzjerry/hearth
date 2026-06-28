'use client'

// The bottom bar for touch. On desktop the StatusBar shows keyboard hints; on a phone those
// shortcuts don't exist, so this replaces them with things a thumb can actually press:
//  - with a terminal open: an accessory row of keys a soft keyboard can't send
//    (esc, tab, a sticky ctrl, ⌃C, arrows) plus a jump-to-session button
//  - otherwise: jump + new, so the command palette and session creation are reachable by touch

interface Props {
  className?: string
  hasTerminal: boolean
  ctrlArmed: boolean
  onKey: (seq: string) => void
  onToggleCtrl: () => void
  onJump: () => void
  onNew: () => void
}

// Fire on pointerdown + preventDefault so the press never blurs xterm's hidden textarea —
// otherwise the soft keyboard dismisses on every key and the bar is unusable.
function cap(onDown: () => void) {
  return (e: React.PointerEvent) => {
    e.preventDefault()
    onDown()
  }
}

const CELL =
  'flex h-9 min-w-[2.25rem] shrink-0 select-none items-center justify-center border border-border px-2 text-[13px] active:bg-sel-bg'

// mousedown also gets preventDefault: the focus-stealing event on a <button> is the synthesized
// mousedown, so killing it (in addition to pointerdown) is what actually keeps the soft keyboard up.
const noFocusSteal = (e: React.MouseEvent) => e.preventDefault()

function KeyCap({ label, seq, onKey }: { label: string; seq: string; onKey: (s: string) => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onPointerDown={cap(() => onKey(seq))}
      onMouseDown={noFocusSteal}
      className={`${CELL} text-accent`}
    >
      {label}
    </button>
  )
}

export default function MobileBar({
  className = '',
  hasTerminal,
  ctrlArmed,
  onKey,
  onToggleCtrl,
  onJump,
  onNew,
}: Props) {
  return (
    <footer
      className={`shrink-0 items-stretch border-t border-border pb-[env(safe-area-inset-bottom)] ${className}`}
    >
      {hasTerminal ? (
        <div className="flex w-full items-stretch">
          <div className="flex flex-1 items-center gap-1 overflow-x-auto px-1 py-1">
            <KeyCap label="esc" seq={'\x1b'} onKey={onKey} />
            <KeyCap label="tab" seq={'\t'} onKey={onKey} />
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={cap(onToggleCtrl)}
              onMouseDown={noFocusSteal}
              aria-pressed={ctrlArmed}
              className={`${CELL} ${ctrlArmed ? 'border-accent bg-sel-bg text-sel-text' : 'text-accent'}`}
              title="next key is sent as ctrl-<key>"
            >
              ctrl
            </button>
            <KeyCap label="⌃C" seq={'\x03'} onKey={onKey} />
            <KeyCap label="↑" seq={'\x1b[A'} onKey={onKey} />
            <KeyCap label="↓" seq={'\x1b[B'} onKey={onKey} />
            <KeyCap label="←" seq={'\x1b[D'} onKey={onKey} />
            <KeyCap label="→" seq={'\x1b[C'} onKey={onKey} />
          </div>
          <button
            type="button"
            onClick={onJump}
            className="flex shrink-0 select-none items-center border-l border-border px-3 text-[12px] text-dim active:bg-sel-bg"
          >
            jump
          </button>
        </div>
      ) : (
        <div className="flex w-full items-center gap-2 px-2 py-1.5 text-[13px]">
          <button
            type="button"
            onClick={onJump}
            className="select-none border border-border px-3 py-1.5 text-accent active:bg-sel-bg"
          >
            jump
          </button>
          <button
            type="button"
            onClick={onNew}
            className="select-none border border-border px-3 py-1.5 text-accent active:bg-sel-bg"
          >
            + new
          </button>
        </div>
      )}
    </footer>
  )
}
