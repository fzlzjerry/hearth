'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import Tabs from './Tabs'
import StatusBar from './StatusBar'
import MobileBar from './MobileBar'
import TerminalView from './TerminalView'
import CommandPalette, { type PaletteItem } from './CommandPalette'
import Modal from './Modal'
import {
  AuthError,
  fetchServers,
  fetchSessions,
  createSession as apiCreate,
  killSession as apiKill,
  addServer as apiAddServer,
  removeServer as apiRemoveServer,
  logout as apiLogout,
} from '@/lib/api'
import type {
  ConnStatus,
  NavRow,
  OpenTab,
  ServerInput,
  ServerSummary,
  SessionInfo,
  TermInputApi,
} from '@/lib/types'

const NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

type ModalState =
  | { type: 'new'; serverId: string }
  | { type: 'kill'; serverId: string; session: string }
  | { type: 'addserver' }
  | { type: 'removeserver'; serverId: string }
  | null

export default function Dashboard() {
  const router = useRouter()

  const [servers, setServers] = useState<ServerSummary[]>([])
  const [sessionsByServer, setSessionsByServer] = useState<Record<string, SessionInfo[] | undefined>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [statusByTab, setStatusByTab] = useState<Record<string, ConnStatus>>({})

  const [focus, setFocus] = useState<'sidebar' | 'terminal'>('sidebar')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false)
  // touch ctrl modifier: armed by the mobile key bar, consumed by the active terminal's next keystroke
  const [ctrlArmed, setCtrlArmed] = useState(false)

  const sidebarWrapRef = useRef<HTMLDivElement>(null)
  // imperative input handles published by each live terminal, keyed by tab id
  const inputApisRef = useRef<Map<string, TermInputApi>>(new Map())

  const registerInput = useCallback((id: string, api: TermInputApi | null) => {
    if (api) inputApisRef.current.set(id, api)
    else inputApisRef.current.delete(id)
  }, [])

  // mobile key bar → active terminal; the terminal clears the ctrl arm itself once spent
  const sendKey = useCallback(
    (seq: string) => {
      if (!activeTabId) return
      const api = inputApisRef.current.get(activeTabId)
      api?.input(seq)
      api?.focus()
    },
    [activeTabId],
  )

  const serverById = useMemo(() => {
    const m = new Map<string, ServerSummary>()
    for (const s of servers) m.set(s.id, s)
    return m
  }, [servers])

  const navRows: NavRow[] = useMemo(() => {
    const rows: NavRow[] = []
    for (const s of servers) {
      rows.push({ kind: 'server', serverId: s.id })
      if (expanded.has(s.id)) {
        for (const info of sessionsByServer[s.id] ?? []) {
          rows.push({ kind: 'session', serverId: s.id, session: info.name, info })
        }
      }
    }
    return rows
  }, [servers, expanded, sessionsByServer])

  const paletteItems: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = []
    for (const s of servers) {
      for (const info of sessionsByServer[s.id] ?? []) {
        items.push({ serverId: s.id, serverName: s.name, session: info.name, attached: info.attached })
      }
    }
    return items
  }, [servers, sessionsByServer])

  const onAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof AuthError) {
        router.replace('/login')
        return true
      }
      return false
    },
    [router],
  )

  const goLogin = useCallback(() => {
    router.replace('/login')
  }, [router])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const srv = await fetchServers()
      setServers(srv)
      setExpanded(new Set(srv.map((s) => s.id)))
      const entries = await Promise.all(
        srv.map(async (s): Promise<[string, SessionInfo[]]> => {
          try {
            return [s.id, await fetchSessions(s.id)]
          } catch (err) {
            if (onAuthError(err)) throw err
            return [s.id, []]
          }
        }),
      )
      setSessionsByServer(Object.fromEntries(entries))
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }, [onAuthError])

  const refreshServer = useCallback(
    async (serverId: string) => {
      try {
        const sessions = await fetchSessions(serverId)
        setSessionsByServer((prev) => ({ ...prev, [serverId]: sessions }))
      } catch (err) {
        onAuthError(err)
      }
    },
    [onAuthError],
  )

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // keep selection in range
  useEffect(() => {
    if (selectedIndex >= navRows.length) setSelectedIndex(Math.max(0, navRows.length - 1))
  }, [navRows.length, selectedIndex])

  // move keyboard focus to the sidebar element so xterm stops capturing keys
  useEffect(() => {
    if (focus === 'sidebar') sidebarWrapRef.current?.focus()
  }, [focus, activeTabId])

  // reflect the active session in the browser tab title
  useEffect(() => {
    const t = tabs.find((x) => x.id === activeTabId)
    document.title = t ? `${t.session} — hearth` : 'hearth · tmux dashboard'
  }, [activeTabId, tabs])

  const attach = useCallback(
    (serverId: string, session: string) => {
      const id = `${serverId}:${session}`
      const serverName = serverById.get(serverId)?.name ?? serverId
      setTabs((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { id, serverId, serverName, session }]))
      setActiveTabId(id)
      setFocus('terminal')
      setPaletteOpen(false)
      setSidebarOpenMobile(false)
    },
    [serverById],
  )

  const closeTab = useCallback(
    (id: string) => {
      const idx = tabs.findIndex((t) => t.id === id)
      const remaining = tabs.filter((t) => t.id !== id)
      setTabs(remaining)
      // closing the last tab: hand focus back to the sidebar so single-key shortcuts keep working
      if (remaining.length === 0) setFocus('sidebar')
      setActiveTabId((cur) => {
        if (cur !== id) return cur
        const neighbor = remaining[idx] ?? remaining[idx - 1] ?? null
        return neighbor?.id ?? null
      })
      setStatusByTab((prev) => {
        const { [id]: _omit, ...rest } = prev
        return rest
      })
    },
    [tabs],
  )

  const cycleTab = useCallback(
    (dir: 1 | -1) => {
      setActiveTabId((cur) => {
        if (tabs.length === 0) return cur
        const i = Math.max(0, tabs.findIndex((t) => t.id === cur))
        const next = (i + dir + tabs.length) % tabs.length
        return tabs[next]?.id ?? cur
      })
    },
    [tabs],
  )

  const switchTabByNumber = useCallback(
    (n: number) => {
      const t = tabs[n - 1]
      if (t) {
        setActiveTabId(t.id)
        setFocus('terminal')
      }
    },
    [tabs],
  )

  const selectedServerId = useCallback((): string | null => {
    const row = navRows[selectedIndex]
    if (row) return row.serverId
    return servers[0]?.id ?? null
  }, [navRows, selectedIndex, servers])

  const activateSelection = useCallback(() => {
    const row = navRows[selectedIndex]
    if (!row) return
    if (row.kind === 'server') {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(row.serverId)) next.delete(row.serverId)
        else next.add(row.serverId)
        return next
      })
    } else {
      attach(row.serverId, row.session)
    }
  }, [navRows, selectedIndex, attach])

  const startNewSession = useCallback(() => {
    const sid = selectedServerId()
    if (sid) setModal({ type: 'new', serverId: sid })
  }, [selectedServerId])

  const startKillSelected = useCallback(() => {
    const row = navRows[selectedIndex]
    if (row?.kind === 'session') setModal({ type: 'kill', serverId: row.serverId, session: row.session })
  }, [navRows, selectedIndex])

  const startAddServer = useCallback(() => setModal({ type: 'addserver' }), [])

  const startRemoveSelectedServer = useCallback(() => {
    const row = navRows[selectedIndex]
    if (row) setModal({ type: 'removeserver', serverId: row.serverId })
  }, [navRows, selectedIndex])

  const removeServerById = useCallback(
    (serverId: string) => {
      const remaining = tabs.filter((t) => t.serverId !== serverId)
      setTabs(remaining)
      setActiveTabId((cur) => (remaining.some((t) => t.id === cur) ? cur : (remaining[0]?.id ?? null)))
      if (remaining.length === 0) setFocus('sidebar')
    },
    [tabs],
  )

  const onRowClick = useCallback(
    (i: number) => {
      setFocus('sidebar')
      setSelectedIndex(i)
      const row = navRows[i]
      if (!row) return
      if (row.kind === 'server') {
        setExpanded((prev) => {
          const next = new Set(prev)
          if (next.has(row.serverId)) next.delete(row.serverId)
          else next.add(row.serverId)
          return next
        })
      } else {
        attach(row.serverId, row.session)
      }
    },
    [navRows, attach],
  )

  const doLogout = useCallback(async () => {
    await apiLogout()
    router.replace('/login')
  }, [router])

  // ── global keyboard ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (paletteOpen || modal) return // those own their keys
      const meta = e.metaKey || e.ctrlKey
      const k = e.key

      if (meta && (k === 'k' || k === 'K')) {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (meta && (k === 'b' || k === 'B')) {
        e.preventDefault()
        setFocus('sidebar')
        return
      }
      if (meta && (k === 'w' || k === 'W')) {
        e.preventDefault()
        if (activeTabId) closeTab(activeTabId)
        return
      }
      if (meta && k === 'ArrowRight') {
        e.preventDefault()
        cycleTab(1)
        return
      }
      if (meta && k === 'ArrowLeft') {
        e.preventDefault()
        cycleTab(-1)
        return
      }
      if (meta && /^[1-9]$/.test(k)) {
        e.preventDefault()
        switchTabByNumber(Number(k))
        return
      }

      if (focus === 'terminal' && activeTabId) return // let xterm handle plain keys

      switch (k) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(navRows.length - 1, i + 1))
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(0, i - 1))
          break
        case 'Enter':
          e.preventDefault()
          activateSelection()
          break
        case 'n':
          e.preventDefault()
          startNewSession()
          break
        case 'd':
          e.preventDefault()
          startKillSelected()
          break
        case 'a':
          e.preventDefault()
          startAddServer()
          break
        case 'x':
          e.preventDefault()
          startRemoveSelectedServer()
          break
        case 'r':
          e.preventDefault()
          void loadAll()
          break
        case '/':
          e.preventDefault()
          setPaletteOpen(true)
          break
        default:
          if (/^[1-9]$/.test(k)) {
            e.preventDefault()
            switchTabByNumber(Number(k))
          }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    paletteOpen,
    modal,
    focus,
    activeTabId,
    navRows.length,
    closeTab,
    cycleTab,
    switchTabByNumber,
    activateSelection,
    startNewSession,
    startKillSelected,
    startAddServer,
    startRemoveSelectedServer,
    loadAll,
  ])

  const activeStatus: ConnStatus = activeTabId ? statusByTab[activeTabId] ?? 'connecting' : 'connecting'

  const sidebarCls = [
    'flex flex-col shrink-0 border-r border-border bg-bg overflow-hidden outline-none',
    'md:static md:flex md:w-[210px]',
    // the drawer is positioned inside the middle region (already below the top bar and above the
    // bottom bar), so it fills that region with inset-y-0 — no hardcoded bar heights to drift out of sync
    sidebarOpenMobile ? 'absolute inset-y-0 left-0 z-40 w-[min(80vw,260px)]' : 'hidden md:flex',
  ].join(' ')

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-bg text-text">
      <TopBar
        status={activeStatus}
        hasActiveTab={!!activeTabId}
        onToggleSidebar={() => setSidebarOpenMobile((v) => !v)}
        onLogout={() => void doLogout()}
      />

      <div className="relative flex min-h-0 flex-1">
        {sidebarOpenMobile ? (
          <div
            className="absolute inset-0 z-30 bg-black/40 md:hidden"
            onMouseDown={() => setSidebarOpenMobile(false)}
          />
        ) : null}

        <div
          ref={sidebarWrapRef}
          tabIndex={-1}
          className={sidebarCls}
          onMouseDown={() => setFocus('sidebar')}
        >
          <Sidebar
            servers={servers}
            sessionsByServer={sessionsByServer}
            expanded={expanded}
            navRows={navRows}
            selectedIndex={selectedIndex}
            paneFocused={focus === 'sidebar'}
            loading={loading}
            error={error}
            onRowClick={onRowClick}
            onRefresh={() => void loadAll()}
            onAddServer={startAddServer}
          />
        </div>

        <main className="flex min-w-0 flex-1 flex-col" onMouseDown={() => activeTabId && setFocus('terminal')}>
          {tabs.length > 0 ? (
            <Tabs
              tabs={tabs}
              activeId={activeTabId}
              status={statusByTab}
              onActivate={(id) => {
                setActiveTabId(id)
                setFocus('terminal')
              }}
              onClose={closeTab}
              onNew={startNewSession}
            />
          ) : null}

          <div className="relative min-h-0 flex-1">
            {tabs.length === 0 ? (
              <EmptyState />
            ) : (
              tabs.map((t) => (
                <div key={t.id} className={t.id === activeTabId ? 'h-full w-full' : 'hidden'}>
                  <TerminalView
                    serverId={t.serverId}
                    session={t.session}
                    tabId={t.id}
                    active={t.id === activeTabId}
                    registerInput={registerInput}
                    ctrlArmed={t.id === activeTabId && ctrlArmed}
                    onCtrlConsumed={() => setCtrlArmed(false)}
                    onStatus={(s) => setStatusByTab((prev) => ({ ...prev, [t.id]: s }))}
                    onAuthError={goLogin}
                  />
                </div>
              ))
            )}
          </div>
        </main>
      </div>

      {/* desktop: keyboard-hint bar · mobile: thumb-operable action / terminal-key bar (CSS-gated, both rendered) */}
      <StatusBar focus={focus} className="hidden md:flex" />
      <MobileBar
        className="flex md:hidden"
        hasTerminal={!!activeTabId}
        ctrlArmed={ctrlArmed}
        onKey={sendKey}
        onToggleCtrl={() => setCtrlArmed((v) => !v)}
        onJump={() => setPaletteOpen(true)}
        onNew={startNewSession}
      />

      {paletteOpen ? (
        <CommandPalette
          items={paletteItems}
          onClose={() => setPaletteOpen(false)}
          onPick={(serverId, session) => attach(serverId, session)}
        />
      ) : null}

      {modal?.type === 'new' ? (
        <NewSessionModal
          serverName={serverById.get(modal.serverId)?.name ?? modal.serverId}
          onClose={() => setModal(null)}
          onCreate={async (name) => {
            try {
              await apiCreate(modal.serverId, name)
            } catch (err) {
              if (onAuthError(err)) return // redirecting to /login; don't fall through
              throw err // surfaces "failed to create" in the modal
            }
            setModal(null)
            await refreshServer(modal.serverId)
            attach(modal.serverId, name)
          }}
        />
      ) : null}

      {modal?.type === 'kill' ? (
        <KillModal
          serverName={serverById.get(modal.serverId)?.name ?? modal.serverId}
          session={modal.session}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const { serverId, session } = modal
            setModal(null)
            await apiKill(serverId, session).catch((err) => {
              if (!onAuthError(err)) setError('failed to kill session')
            })
            closeTab(`${serverId}:${session}`)
            await refreshServer(serverId)
          }}
        />
      ) : null}

      {modal?.type === 'addserver' ? (
        <AddServerModal
          existingIds={servers.map((s) => s.id)}
          onClose={() => setModal(null)}
          onSubmit={async (input) => {
            try {
              await apiAddServer(input)
            } catch (err) {
              if (onAuthError(err)) return
              throw err // surfaces the hub's error message in the modal
            }
            setModal(null)
            await loadAll()
          }}
        />
      ) : null}

      {modal?.type === 'removeserver' ? (
        <RemoveServerModal
          serverName={serverById.get(modal.serverId)?.name ?? modal.serverId}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const { serverId } = modal
            setModal(null)
            removeServerById(serverId)
            await apiRemoveServer(serverId).catch((err) => {
              if (!onAuthError(err)) setError('failed to remove server')
            })
            await loadAll()
          }}
        />
      ) : null}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full w-full select-none items-center justify-center px-6">
      <div className="text-center">
        <div className="text-[16px]">
          <span className="text-accent">›</span> <span className="font-bold text-accent">hearth</span>{' '}
          <span className="text-dimmer">tmux dashboard</span>
        </div>
        {/* desktop drives by keyboard; touch drives by the hamburger + the bottom action bar */}
        <p className="mt-5 hidden text-[12px] text-dim md:block">
          select a session and press <span className="text-accent">⏎</span> to attach
        </p>
        <p className="mt-2 hidden text-[12px] text-dimmer md:block">
          <span className="text-accent">⌘K</span> jump
          <span className="mx-1.5 text-dimmer">·</span>
          <span className="text-accent">n</span> new
          <span className="mx-1.5 text-dimmer">·</span>
          <span className="text-accent">a</span> add server
        </p>
        <p className="mt-5 text-[12px] text-dim md:hidden">
          tap <span className="text-accent">≡</span> to pick a session
        </p>
        <p className="mt-2 text-[12px] text-dimmer md:hidden">
          or <span className="text-accent">jump</span> / <span className="text-accent">new</span> below
        </p>
      </div>
    </div>
  )
}

function NewSessionModal({
  serverName,
  onClose,
  onCreate,
}: {
  serverName: string
  onClose: () => void
  onCreate: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!NAME_RE.test(name)) {
      setErr('use letters, digits, _ . - (max 64)')
      return
    }
    setBusy(true)
    try {
      await onCreate(name)
    } catch {
      setErr('failed to create session')
      setBusy(false)
    }
  }

  return (
    <Modal title={`new session · ${serverName}`} onClose={onClose} width={440}>
      <form onSubmit={submit} className="px-3 py-3">
        <label className="mb-1 block text-[12px] text-dim">session name</label>
        <div className="flex items-center border border-border px-2 py-1 focus-within:border-accent">
          <span className="mr-2 select-none text-accent">›</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setErr('')
            }}
            spellCheck={false}
            className="w-full bg-transparent text-[13px] text-sel-text caret-accent outline-none"
          />
        </div>
        {err ? <div className="mt-2 text-[12px] text-danger">✗ {err}</div> : null}
        <div className="mt-3 flex gap-2 text-[12px]">
          <button type="submit" disabled={busy} className="border border-border px-2 py-1 text-accent hover:bg-sel-bg disabled:text-dimmer">
            {busy ? 'creating…' : 'create ⏎'}
          </button>
          <button type="button" onClick={onClose} className="border border-border px-2 py-1 text-dim hover:text-text">
            cancel esc
          </button>
        </div>
      </form>
    </Modal>
  )
}

function KillModal({
  serverName,
  session,
  onClose,
  onConfirm,
}: {
  serverName: string
  session: string
  onClose: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault()
        e.stopPropagation()
        onConfirm()
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onConfirm, onClose])

  return (
    <Modal title="kill session" onClose={onClose} width={440}>
      <div className="px-3 py-3 text-[13px]">
        <p>
          <span className="text-dim">kill </span>
          <span className="text-danger">{session}</span>
          <span className="text-dim"> on </span>
          <span className="text-text">{serverName}</span>
          <span className="text-dim">?</span>
        </p>
        <p className="mt-1 text-[12px] text-dim">this ends the tmux session and every process in it.</p>
        <div className="mt-3 flex gap-2 text-[12px]">
          <button
            onClick={onConfirm}
            className="border border-danger px-2 py-1 text-danger hover:bg-danger hover:text-bg"
          >
            kill (y)
          </button>
          <button onClick={onClose} className="border border-border px-2 py-1 text-dim hover:text-text">
            cancel (n)
          </button>
        </div>
      </div>
    </Modal>
  )
}

function AddServerModal({
  existingIds,
  onClose,
  onSubmit,
}: {
  existingIds: string[]
  onClose: () => void
  onSubmit: (input: ServerInput) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [local, setLocal] = useState(false)
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [user, setUser] = useState('')
  const [identityFile, setIdentityFile] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function uniqueId(base: string): string {
    const set = new Set(existingIds)
    let id = base
    let n = 2
    while (set.has(id)) id = `${base}-${n++}`
    return id
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setErr('name is required')
    if (!local && (!host.trim() || !user.trim())) return setErr('host and user are required for a remote server')
    const id = uniqueId(slugify(name) || 'server')
    const input: ServerInput = local
      ? { id, name: name.trim(), local: true }
      : {
          id,
          name: name.trim(),
          host: host.trim(),
          port: Number(port) || 22,
          user: user.trim(),
          identityFile: identityFile.trim() || undefined,
          password: password.trim() || undefined,
        }
    setBusy(true)
    setErr('')
    try {
      await onSubmit(input)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'failed to add server')
      setBusy(false)
    }
  }

  const field = 'w-full bg-transparent text-[13px] text-sel-text caret-accent outline-none placeholder:text-dimmer'
  const box = 'flex items-center border border-border px-2 py-1 focus-within:border-accent'
  const lbl = 'mb-1 mt-2 block text-[12px] text-dim'

  return (
    <Modal title="add server" onClose={onClose} width={460}>
      <form onSubmit={submit} className="px-3 py-3">
        <label className={`${lbl} mt-0`}>name</label>
        <div className={box}>
          <input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setErr('') }}
            placeholder="vps · frankfurt"
            spellCheck={false}
            className={field}
          />
        </div>

        <label className="mt-3 flex select-none items-center gap-2 text-[12px] text-dim">
          <input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} className="accent-accent" />
          this machine (local · node-pty, no SSH)
        </label>

        {!local ? (
          <>
            <label className={lbl}>host</label>
            <div className={box}>
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="203.0.113.10" spellCheck={false} className={field} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className={lbl}>user</label>
                <div className={box}>
                  <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="deploy" spellCheck={false} className={field} />
                </div>
              </div>
              <div className="w-24">
                <label className={lbl}>port</label>
                <div className={box}>
                  <input value={port} onChange={(e) => setPort(e.target.value)} spellCheck={false} className={field} />
                </div>
              </div>
            </div>
            <label className={lbl}>identity file — path on the hub</label>
            <div className={box}>
              <input value={identityFile} onChange={(e) => setIdentityFile(e.target.value)} placeholder="~/.ssh/id_ed25519" spellCheck={false} className={field} />
            </div>
            <label className={lbl}>password — optional, leave blank to use the key</label>
            <div className={box}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            </div>
          </>
        ) : null}

        {err ? <div className="mt-2 text-[12px] text-danger">✗ {err}</div> : null}
        <div className="mt-3 flex gap-2 text-[12px]">
          <button type="submit" disabled={busy} className="border border-border px-2 py-1 text-accent hover:bg-sel-bg disabled:text-dimmer">
            {busy ? 'adding…' : 'add ⏎'}
          </button>
          <button type="button" onClick={onClose} className="border border-border px-2 py-1 text-dim hover:text-text">
            cancel esc
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RemoveServerModal({
  serverName,
  onClose,
  onConfirm,
}: {
  serverName: string
  onClose: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); e.stopPropagation(); onConfirm() }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onConfirm, onClose])

  return (
    <Modal title="remove server" onClose={onClose} width={440}>
      <div className="px-3 py-3 text-[13px]">
        <p>
          <span className="text-dim">remove </span>
          <span className="text-danger">{serverName}</span>
          <span className="text-dim"> from the hub?</span>
        </p>
        <p className="mt-1 text-[12px] text-dim">drops its config only — tmux sessions keep running on the host.</p>
        <div className="mt-3 flex gap-2 text-[12px]">
          <button onClick={onConfirm} className="border border-danger px-2 py-1 text-danger hover:bg-danger hover:text-bg">
            remove (y)
          </button>
          <button onClick={onClose} className="border border-border px-2 py-1 text-dim hover:text-text">
            cancel (n)
          </button>
        </div>
      </div>
    </Modal>
  )
}
