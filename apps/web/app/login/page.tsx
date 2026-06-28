'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = 'login · hearth'
    inputRef.current?.focus()
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.replace('/')
        router.refresh()
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'login failed')
        setBusy(false)
      }
    } catch {
      setError('network error')
      setBusy(false)
    }
  }

  return (
    <main className="flex h-dvh w-screen items-center justify-center bg-bg p-4 text-text">
      <div className="w-full max-w-[360px] border border-border">
        {/* hairline title */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[12px]">
          <span className="flex items-center gap-1.5">
            <span className="select-none text-accent">›</span>
            <span className="text-accent">hearth</span>
          </span>
          <span className="text-dim">login</span>
          <span className="flex-1 select-none overflow-hidden text-dimmer">
            {' ' + '─'.repeat(40)}
          </span>
        </div>

        <form onSubmit={onSubmit} className="px-3 py-4">
          <label className="mb-1 block text-[12px] text-dim">password</label>
          <div className="flex items-center border border-border bg-black/20 px-2 py-1.5 focus-within:border-accent">
            <span className="mr-2 select-none text-accent">›</span>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full bg-transparent text-[13px] text-sel-text caret-accent outline-none"
              spellCheck={false}
            />
          </div>

          {error ? <div className="mt-2 text-[12px] text-danger">✗ {error}</div> : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full border border-border px-2 py-1.5 text-[12px] text-accent hover:bg-sel-bg hover:text-sel-text disabled:text-dimmer"
          >
            {busy ? 'authenticating…' : 'enter ⏎'}
          </button>
        </form>

        <div className="border-t border-border px-3 py-1 text-[11px] text-dimmer">
          tmux dashboard · self-hosted
        </div>
      </div>
    </main>
  )
}
