'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import { fuzzyFilter } from '@/lib/fuzzy'

export interface PaletteItem {
  serverId: string
  serverName: string
  session: string
  attached: boolean
}

interface Props {
  items: PaletteItem[]
  onClose: () => void
  onPick: (serverId: string, session: string) => void
}

export default function CommandPalette({ items, onClose, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(
    () => fuzzyFilter(query, items, (it) => `${it.serverName}/${it.session}`),
    [query, items],
  )

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])

  function pick(i: number) {
    const r = results[i]
    if (!r) return
    onPick(r.item.serverId, r.item.session)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault()
      setIndex((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(index)
    }
  }

  return (
    <Modal title="jump to session" onClose={onClose} width={480}>
      <div className="px-3 py-2">
        <div className="flex items-center border border-border px-2 py-1 focus-within:border-accent">
          <span className="mr-2 select-none text-accent">/</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="filter sessions…"
            spellCheck={false}
            className="w-full bg-transparent text-[13px] text-sel-text caret-accent outline-none placeholder:text-dimmer"
          />
        </div>
      </div>
      <div ref={listRef} className="max-h-[40vh] overflow-y-auto border-t border-border">
        {results.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-dim">no matches</div>
        ) : (
          results.map((r, i) => {
            const selected = i === index
            return (
              <button
                key={`${r.item.serverId}:${r.item.session}`}
                data-i={i}
                onMouseMove={() => setIndex(i)}
                onClick={() => pick(i)}
                className={`flex h-6 w-full items-center border-l-2 px-2 text-left text-[13px] ${
                  selected ? 'border-accent bg-sel-bg text-sel-text' : 'border-transparent text-text'
                }`}
              >
                <span className={`mr-2 select-none ${r.item.attached ? 'text-live' : 'text-dimmer'}`}>
                  {r.item.attached ? '●' : '○'}
                </span>
                <span className="truncate">{r.item.session}</span>
                <span className="flex-1" />
                <span className="truncate text-dimmer">{r.item.serverName}</span>
              </button>
            )
          })
        )}
      </div>
    </Modal>
  )
}
