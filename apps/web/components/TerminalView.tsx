'use client'

import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import type { Terminal as XTerm } from '@xterm/xterm'
import type { FitAddon as XFitAddon } from '@xterm/addon-fit'
import { AuthError, fetchWsToken } from '@/lib/api'
import type { ConnStatus } from '@/lib/types'

// Exact palette from the spec — xterm needs concrete hex (it can't read CSS vars).
const THEME = {
  background: '#0d0e0f',
  foreground: '#c4c8c5',
  cursor: '#6cb6a4',
  cursorAccent: '#0d0e0f',
  selectionBackground: '#173430',
  black: '#0d0e0f',
  red: '#cf7d75',
  green: '#84b86f',
  yellow: '#c9a86a',
  blue: '#6cb6a4',
  magenta: '#b08fc7',
  cyan: '#7fb9ad',
  white: '#c4c8c5',
  brightBlack: '#5b605d',
  brightRed: '#e0938b',
  brightGreen: '#9bcb86',
  brightYellow: '#d8bd86',
  brightBlue: '#86c4b3',
  brightMagenta: '#c4a8d6',
  brightCyan: '#96cabb',
  brightWhite: '#e6e9e7',
}

// Prefer a locally-installed Nerd Font so powerline/devicon glyphs (tmux status, shell prompts)
// render instead of tofu. xterm's default DOM renderer does per-glyph CSS fallback, so plain text
// still comes from JetBrains Mono if no Nerd Font is present. Override via NEXT_PUBLIC_TERMINAL_FONT.
const TERMINAL_FONT =
  process.env.NEXT_PUBLIC_TERMINAL_FONT ||
  '"MesloLGS NF", "JetBrainsMono Nerd Font", "Hack Nerd Font", "Symbols Nerd Font", ' +
    '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

interface Props {
  serverId: string
  session: string
  active: boolean
  onStatus?: (s: ConnStatus) => void
  onAuthError?: () => void
}

export default function TerminalView({ serverId, session, active, onStatus, onAuthError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<XFitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const disposedRef = useRef(false)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)
  const encRef = useRef(new TextEncoder())
  const [status, setStatus] = useState<ConnStatus>('connecting')

  function emitStatus(s: ConnStatus) {
    setStatus(s)
    onStatus?.(s)
  }

  function safeFit() {
    const fit = fitRef.current
    const el = containerRef.current
    if (!fit || !el || el.offsetWidth === 0 || el.offsetHeight === 0) return
    try {
      fit.fit()
    } catch {
      /* ignore transient fit errors */
    }
  }

  function sendResize(cols: number, rows: number) {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  }

  function scheduleReconnect() {
    if (disposedRef.current) return
    const n = Math.min(attemptRef.current, 5)
    attemptRef.current += 1
    const delay = Math.min(10_000, 500 * 2 ** n)
    if (reconnectRef.current) clearTimeout(reconnectRef.current)
    reconnectRef.current = setTimeout(() => void connect(), delay)
  }

  async function connect() {
    if (disposedRef.current) return
    emitStatus('connecting')
    let token: string
    let wsUrl: string
    try {
      const r = await fetchWsToken()
      token = r.token
      wsUrl = r.wsUrl
    } catch (err) {
      // Session expired → bounce to login instead of hammering /api/token forever.
      if (err instanceof AuthError) {
        onAuthError?.()
        return
      }
      scheduleReconnect()
      return
    }
    if (disposedRef.current) return

    const term = termRef.current
    const cols = term?.cols ?? 80
    const rows = term?.rows ?? 24
    const url =
      `${wsUrl}/attach?server=${encodeURIComponent(serverId)}` +
      `&session=${encodeURIComponent(session)}&cols=${cols}&rows=${rows}` +
      `&token=${encodeURIComponent(token)}`

    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      attemptRef.current = 0
      emitStatus('connected')
      safeFit()
      const t = termRef.current
      if (t) sendResize(t.cols, t.rows)
      if (active) t?.focus()
    }
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') return // server control frames (unused for now)
      termRef.current?.write(new Uint8Array(ev.data as ArrayBuffer))
    }
    ws.onclose = () => {
      if (disposedRef.current) return
      emitStatus('disconnected')
      scheduleReconnect()
    }
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
  }

  // Create the terminal + connect. Re-runs only if the target session changes.
  useEffect(() => {
    disposedRef.current = false
    let ro: ResizeObserver | null = null

    void (async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ])
      if (disposedRef.current || !containerRef.current) return

      const term = new Terminal({
        theme: THEME,
        fontFamily: TERMINAL_FONT,
        fontSize: 13,
        // 1.0 so powerline/Nerd Font separators fill the cell and tile seamlessly, like a native terminal.
        lineHeight: 1.0,
        cursorBlink: true,
        allowProposedApi: true,
        macOptionIsMeta: true,
        scrollback: 10_000,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.loadAddon(new WebLinksAddon())
      term.open(containerRef.current)
      termRef.current = term
      fitRef.current = fit
      safeFit()

      term.onData((data) => {
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(encRef.current.encode(data))
      })
      term.onResize(({ cols, rows }) => sendResize(cols, rows))

      ro = new ResizeObserver(() => safeFit())
      ro.observe(containerRef.current)

      void connect()
      if (active) {
        safeFit()
        term.focus()
      }
    })()

    return () => {
      disposedRef.current = true
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      ro?.disconnect()
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        ws.onclose = null
        try {
          ws.close(1000, 'unmount')
        } catch {
          /* ignore */
        }
      }
      termRef.current?.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, session])

  // Refit + focus whenever this tab becomes active (it may have been display:none).
  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => {
      safeFit()
      termRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [active])

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <div ref={containerRef} className="h-full w-full px-2 pt-1.5" />
      {status !== 'connected' ? (
        <div className="pointer-events-none absolute right-2 top-2 border border-border bg-bg px-2 py-0.5 text-[11px]">
          <span className={status === 'connecting' ? 'text-data' : 'text-danger'}>●</span>{' '}
          <span className="text-dim">{status === 'connecting' ? 'connecting…' : 'reconnecting…'}</span>
        </div>
      ) : null}
    </div>
  )
}
