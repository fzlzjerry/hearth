'use client'

import { useEffect } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}

export default function Modal({ title, onClose, children, width = 420 }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[8vh] sm:pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full flex-col border border-border bg-bg"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 select-none items-center gap-2 border-b border-border px-3 py-1 text-[11px]">
          <span className="text-accent">{title}</span>
          <span className="flex-1 overflow-hidden text-dimmer">{'─'.repeat(60)}</span>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
