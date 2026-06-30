'use client'

import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import type { Terminal as XTerm } from '@xterm/xterm'
import type { FitAddon as XFitAddon } from '@xterm/addon-fit'
import { AuthError, fetchWsToken, uploadImage } from '@/lib/api'
import { copyToClipboard, decodeBase64Utf8 } from '@/lib/clipboard'
import type { ConnStatus, TermInputApi } from '@/lib/types'

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

/** Read a File as a bare base64 string (strips the `data:<mime>;base64,` prefix). */
function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma === -1 ? '' : result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

interface Props {
  serverId: string
  session: string
  active: boolean
  onStatus?: (s: ConnStatus) => void
  onAuthError?: () => void
  /** `${serverId}:${session}` — the key under which this terminal registers its input handle. */
  tabId?: string
  /** Publish/retract this terminal's imperative input handle so the touch key bar can reach it. */
  registerInput?: (id: string, api: TermInputApi | null) => void
  /** When true, the next typed key is rewritten as ctrl-<key> (the touch ctrl modifier). */
  ctrlArmed?: boolean
  /** Fired the moment the armed ctrl is spent (or cleared on blur), so the owner can disarm. */
  onCtrlConsumed?: () => void
}

export default function TerminalView({
  serverId,
  session,
  active,
  onStatus,
  onAuthError,
  tabId,
  registerInput,
  ctrlArmed,
  onCtrlConsumed,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<XFitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const disposedRef = useRef(false)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)
  const encRef = useRef(new TextEncoder())
  const ctrlArmedRef = useRef(false)
  const blurCleanupRef = useRef<(() => void) | null>(null)
  // hold the latest callbacks/ids in refs so the once-only onData handler never reads a stale closure
  const onCtrlConsumedRef = useRef(onCtrlConsumed)
  const registerInputRef = useRef(registerInput)
  const tabIdRef = useRef(tabId)
  const [status, setStatus] = useState<ConnStatus>('connecting')
  // Transient indicator for a pasted-image upload (null = nothing in flight).
  const [imagePaste, setImagePaste] = useState<'uploading' | 'error' | null>(null)
  const imagePasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    ctrlArmedRef.current = !!ctrlArmed
  }, [ctrlArmed])
  useEffect(() => {
    onCtrlConsumedRef.current = onCtrlConsumed
    registerInputRef.current = registerInput
    tabIdRef.current = tabId
  })

  // Spend the armed ctrl (if any) and rewrite a single ascii letter / @[\]^_ into its control code.
  function applyCtrl(data: string): string {
    if (!ctrlArmedRef.current) return data
    ctrlArmedRef.current = false
    onCtrlConsumedRef.current?.()
    if (data.length !== 1) return data
    const c = data.charCodeAt(0)
    if ((c >= 0x40 && c <= 0x5f) || (c >= 0x61 && c <= 0x7a)) return String.fromCharCode(c & 0x1f)
    return data
  }

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

  // Write raw text into the PTY (used to "type" a pasted image's path into the prompt).
  function sendText(text: string) {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(encRef.current.encode(text))
  }

  function flashImagePaste(state: 'uploading' | 'error' | null) {
    if (imagePasteTimerRef.current) {
      clearTimeout(imagePasteTimerRef.current)
      imagePasteTimerRef.current = null
    }
    setImagePaste(state)
    if (state === 'error') imagePasteTimerRef.current = setTimeout(() => setImagePaste(null), 4000)
  }

  // Upload a pasted image to the host and type its absolute path into the terminal, so CLIs like
  // Claude Code (which can't reach the local clipboard over SSH) can read it by path.
  async function handleImagePaste(file: File) {
    flashImagePaste('uploading')
    try {
      const dataBase64 = await readFileBase64(file)
      const { path } = await uploadImage(serverId, {
        filename: file.name || 'pasted-image.png',
        mime: file.type || 'image/png',
        dataBase64,
      })
      sendText(`${path} `)
      flashImagePaste(null)
      termRef.current?.focus()
    } catch (err) {
      if (err instanceof AuthError) onAuthError?.()
      flashImagePaste('error')
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
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(encRef.current.encode(applyCtrl(data)))
      })
      term.onResize(({ cols, rows }) => sendResize(cols, rows))

      // clear a stale ctrl arm if focus leaves before the next keystroke lands
      const textarea = term.textarea
      const onBlur = () => {
        if (ctrlArmedRef.current) {
          ctrlArmedRef.current = false
          onCtrlConsumedRef.current?.()
        }
      }
      textarea?.addEventListener('blur', onBlur)

      // Paste an image -> upload to the host -> type its path into the prompt. preventDefault stops
      // xterm from pasting the (useless) text representation of the image clipboard item.
      const onPaste = (e: ClipboardEvent) => {
        const items = e.clipboardData?.items
        if (!items) return
        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          if (it.kind === 'file' && it.type.startsWith('image/')) {
            const file = it.getAsFile()
            if (!file) continue
            e.preventDefault()
            void handleImagePaste(file)
            return
          }
        }
      }
      textarea?.addEventListener('paste', onPaste)

      // Copy-on-select: mirror the terminal selection to the local clipboard (debounced so a drag
      // doesn't hammer the clipboard API). This is what makes selecting text land on the user's machine.
      let selTimer: ReturnType<typeof setTimeout> | null = null
      const selDisp = term.onSelectionChange(() => {
        if (selTimer) clearTimeout(selTimer)
        selTimer = setTimeout(() => {
          const sel = termRef.current?.getSelection()
          if (sel && sel.trim()) void copyToClipboard(sel)
        }, 40)
      })

      // OSC 52: let apps inside tmux (vim, copy-mode, …) set the local clipboard. Needs tmux
      // `set-clipboard on` + passthrough to actually forward the sequence out (see README).
      const oscDisp = term.parser.registerOscHandler(52, (data) => {
        const semi = data.indexOf(';')
        if (semi === -1) return false
        const payload = data.slice(semi + 1)
        if (payload === '' || payload === '?') return true // clear / read-request: nothing to copy
        try {
          void copyToClipboard(decodeBase64Utf8(payload))
        } catch {
          /* malformed base64 — ignore */
        }
        return true
      })

      blurCleanupRef.current = () => {
        textarea?.removeEventListener('blur', onBlur)
        textarea?.removeEventListener('paste', onPaste)
        selDisp.dispose()
        oscDisp.dispose()
        if (selTimer) clearTimeout(selTimer)
      }

      // publish an imperative handle so the touch key bar can inject keys this terminal can't get otherwise
      const id = tabIdRef.current
      if (id) {
        registerInputRef.current?.(id, {
          input: (d) => termRef.current?.input(d),
          focus: () => termRef.current?.focus(),
        })
      }

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
      if (imagePasteTimerRef.current) clearTimeout(imagePasteTimerRef.current)
      ro?.disconnect()
      blurCleanupRef.current?.()
      blurCleanupRef.current = null
      if (tabIdRef.current) registerInputRef.current?.(tabIdRef.current, null)
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
    <div className="relative h-full w-full overflow-hidden overscroll-contain bg-bg">
      <div ref={containerRef} className="h-full w-full overscroll-contain px-2 pt-1.5" />
      {status !== 'connected' ? (
        <div className="pointer-events-none absolute right-2 top-2 border border-border bg-bg px-2 py-0.5 text-[11px]">
          <span className={status === 'connecting' ? 'text-data' : 'text-danger'}>●</span>{' '}
          <span className="text-dim">{status === 'connecting' ? 'connecting…' : 'reconnecting…'}</span>
        </div>
      ) : null}
      {imagePaste ? (
        <div className="pointer-events-none absolute bottom-2 right-2 border border-border bg-bg px-2 py-0.5 text-[11px]">
          {imagePaste === 'uploading' ? (
            <span className="text-dim">uploading image…</span>
          ) : (
            <span className="text-danger">image upload failed</span>
          )}
        </div>
      ) : null}
    </div>
  )
}
