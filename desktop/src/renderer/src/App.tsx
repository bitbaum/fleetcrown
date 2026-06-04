// @ts-nocheck -- JSX namespace resolution in shared tsconfig; Vite build succeeds fine
import { useState, useEffect } from 'react'
import { APP_NAME } from '@/config/brand'

declare global {
  interface Window {
    fleetRunner: {
      ping: () => Promise<string>
      getRuntimeStatus: () => Promise<any>
      getProjects: () => Promise<any>
      dispatchIntent: (args: { projectKey: string; intent: string; queueHead?: string }) => Promise<any>
      getCurrentState: () => Promise<any>
      loadToken: () => Promise<string | null>
      saveToken: (token: string) => Promise<{ ok: boolean }>
      clearToken: () => Promise<{ ok: boolean }>
      getConfigDir: () => Promise<string | null>
      probeCloud: () => Promise<boolean>
      switchToCloud: () => Promise<boolean>
    }
  }
}

function App(): JSX.Element {
  const [status, setStatus] = useState<any>(null)
  const [projects, setProjects] = useState<any>(null)
  const [response, setResponse] = useState<string>('')
  const [dispatching, setDispatching] = useState<string | null>(null)
  const [token, setToken] = useState<string>('')
  const [connected, setConnected] = useState<boolean>(false)
  const [configDir, setConfigDir] = useState<string>('')
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [lastDispatch, setLastDispatch] = useState<any>(null)

  const refreshStatus = async () => {
    try {
      const s = await window.fleetRunner.getRuntimeStatus()
      setStatus(s)
    } catch (e) {
      setResponse('Error: ' + (e as Error).message)
    }
  }

  const loadProjects = async () => {
    try {
      const p = await window.fleetRunner.getProjects()
      setProjects(p)
      const keys = p ? Object.keys(p) : []
      if (keys.length > 0 && !selectedProject) {
        setSelectedProject(keys[0])
      }
    } catch (e) {
      setResponse('Error: ' + (e as Error).message)
    }
  }

  const loadSavedToken = async () => {
    try {
      const saved = await window.fleetRunner.loadToken()
      const dir = await window.fleetRunner.getConfigDir()
      setConfigDir(dir || '')
      if (saved) {
        setToken(saved)
        setConnected(true)
      }
    } catch {}
  }

  const handleConnect = async () => {
    if (!token.trim()) return
    try {
      const res = await window.fleetRunner.saveToken(token.trim())
      if (res.ok) {
        setConnected(true)
        setResponse(`Token saved. This app can now act as your local runtime for ${APP_NAME} (use the same token in web settings if needed).`)
      } else {
        setResponse('Failed to save token: ' + (res.error || 'unknown'))
      }
    } catch (e) {
      setResponse('Error saving token: ' + (e as Error).message)
    }
  }

  const handleSync = async () => {
    if (!token) {
      setResponse('Connect with token first (paste in the Connect box above)')
      return
    }
    try {
      const projList = projects ? Object.keys(projects).map((k: string) => ({
        tab: k,
        agentRunning: false,
        tabOpen: true,
        activeAgents: [],
        observedAt: Date.now() / 1000
      })) : []
      const body = {
        projects: projList,
        openTabs: Object.keys(projects || {}),
        installedAgents: ['claude', 'codex'], // example; in real we'd detect
        observedAt: Date.now()
      }
      const res = await fetch('https://fleetcrown.vercel.app/api/control/runtime-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })
      if (res.ok) {
        setResponse(`Synced to ${APP_NAME} web! The control plane should now see this desktop app as your local runtime for these projects.`)
        await refreshStatus()
      } else {
        const err = await res.text().catch(() => res.statusText)
        setResponse('Sync failed: ' + err)
      }
    } catch (e) {
      setResponse('Sync error: ' + (e as Error).message)
    }
  }

  useEffect(() => {
    refreshStatus()
    loadProjects()
    loadSavedToken()
  }, [])

  useEffect(() => {
    if (connected && token) {
      // Auto-sync once when we have a token (so the web immediately sees this as the runtime)
      handleSync()
    }
  }, [connected])

  const handlePing = async () => {
    const res = await window.fleetRunner.ping()
    setResponse(res)
  }

  const [reconnecting, setReconnecting] = useState(false)

  // "Try cloud" — probe + switch. The user lands here when the cloud was
  // unreachable on launch (Vercel down, no wifi, DB quota). Once they want
  // to retry, this opens the web shell again. If the probe fails the
  // button stays here; if the probe succeeds we navigate and Electron's
  // did-fail-load will auto-fall-back if the switch breaks mid-load.
  const handleTryCloud = async () => {
    setReconnecting(true)
    try {
      const reachable = await window.fleetRunner.probeCloud()
      if (!reachable) {
        setResponse('Cloud is still unreachable. Staying in local mode.')
        return
      }
      const switched = await window.fleetRunner.switchToCloud()
      if (!switched) {
        setResponse('Could not switch to cloud — staying in local mode.')
      }
    } finally {
      setReconnecting(false)
    }
  }

  const handleDispatch = async (projectKey: string, intent: string, prompt?: string) => {
    const target = selectedProject || projectKey
    setDispatching(target + ':' + intent)
    setResponse('')
    setLastDispatch(null)
    try {
      const res = await window.fleetRunner.dispatchIntent({ projectKey: target, intent, queueHead: prompt })
      setLastDispatch(res)
      await refreshStatus()
    } catch (e) {
      setResponse('Error: ' + (e as Error).message)
    } finally {
      setDispatching(null)
    }
  }

  const projectKeys = projects ? Object.keys(projects) : []

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
      {/* Runner header — uses runner primitives + fleet-* from globals */}
      <div className="border-b border-[var(--border)] px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="runner-status-dot" />
          <div>
            <div className="fleet-header">{APP_NAME.toUpperCase()}</div>
            <div className="text-sm font-medium tracking-[-0.2px] -mt-0.5">Fleet Runner</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-[var(--text-muted)] font-mono tracking-[1px]">LOCAL • AUTHORITATIVE</div>
          <button
            type="button"
            onClick={handleTryCloud}
            disabled={reconnecting}
            className="text-xs px-2.5 py-1 rounded border border-[var(--border)] hover:border-[var(--border-hover,var(--border))] text-[var(--text-muted)] hover:text-[var(--text)] transition disabled:opacity-50"
            title="Try connecting to the FleetCrown web shell again"
          >
            {reconnecting ? 'Probing…' : 'Try cloud'}
          </button>
        </div>
      </div>

      <div className="max-w-[860px] mx-auto px-8 pt-16 pb-24">
        {/* Hero */}
        <div className="mb-12">
          <div className="fleet-header mb-2">YOUR MACHINES. YOUR AGENTS.</div>
          <h1 className="fleet-title tracking-[-1.5px] leading-none">
            The Fleet Runner<br />runs here.
          </h1>
          <p className="mt-4 max-w-md text-base text-[var(--text-muted)]">
            Direct execution. No intermediaries. The desktop app is the source of truth for everything your agents do.
          </p>

          {/* Connect card */}
          <div className="runner-card mt-6 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="runner-label">CONNECT TO FLEETCROWN</div>
              {connected && <div className="text-[length:var(--text-micro)] px-2 py-0.5 bg-emerald-900 text-emerald-400 rounded">CONNECTED</div>}
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste agent token (ck_...)"
                className="runner-input flex-1"
              />
              <button onClick={handleConnect} className="runner-btn">
                CONNECT
              </button>
            </div>
            {configDir && <div className="text-[length:var(--text-micro)] text-[var(--text-muted)] mt-1 font-mono">Saved to {configDir}</div>}
          </div>
        </div>

        {/* Runtime status */}
        <div className="runner-card mb-6 p-8">
          <div className="flex items-baseline justify-between mb-6">
            <div className="runner-label">RUNTIME</div>
            <div className="flex items-center gap-3">
              <button onClick={refreshStatus} className="runner-btn-ghost">
                REFRESH
              </button>
              <button 
                onClick={handleSync}
                disabled={!connected}
                className="runner-btn-ghost disabled:opacity-50"
              >
                SYNC TO WEB
              </button>
            </div>
          </div>
          {status ? (
            <div>
              <div className="flex gap-2 mb-2">
                {status.hasWatcher && <span className="text-[length:var(--text-micro)] px-2 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded">watcher embedded</span>}
                {status.usesRealEventLog && <span className="text-[length:var(--text-micro)] px-2 py-0.5 bg-emerald-900/60 text-emerald-400 rounded">real event log</span>}
              </div>
              <div className="runner-mono text-[length:var(--text-micro)] opacity-75">
                {status.projectCount ?? 0} projects • home stack {status.homeStackIntegrated ? 'active' : 'partial'}
              </div>
              <details className="mt-2">
                <summary className="runner-label cursor-pointer">raw status</summary>
                <div className="runner-mono text-[length:var(--text-micro)] mt-1 opacity-60">{JSON.stringify(status, null, 0)}</div>
              </details>
            </div>
          ) : (
            <div className="text-[var(--text-muted)] text-sm">Loading local state…</div>
          )}
        </div>

        {/* Projects */}
        <div className="runner-card p-8">
          <div className="flex items-baseline justify-between mb-6">
            <div>
              <div className="runner-label">PROJECTS</div>
              <div className="text-2xl font-semibold tracking-[-0.4px] mt-1">{projectKeys.length} active</div>
            </div>
            <button onClick={loadProjects} className="runner-btn-ghost">
              RELOAD CONFIG
            </button>
          </div>

          {projectKeys.length > 0 ? (
            <div className="space-y-px">
              {projectKeys.slice(0, 8).map((key: string) => {
                const isSel = selectedProject === key
                return (
                  <div
                    key={key}
                    onClick={() => setSelectedProject(key)}
                    className={`runner-project flex items-center justify-between cursor-pointer ${isSel ? 'selected' : ''}`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm tracking-[-0.1px] flex items-center gap-2">
                        {key}
                        {isSel && <span className="text-[length:var(--text-micro)] text-[var(--accent)]">SELECTED</span>}
                      </div>
                      <div className="text-[length:var(--text-micro)] text-[var(--text-muted)] font-mono truncate mt-px">
                        {projects[key]?.dir || '—'}
                      </div>
                    </div>

                    {isSel && (
                      <div className="flex gap-2 ml-4 flex-shrink-0">
                        {['next_best', 'test_and_fix', 'close_session'].map((intent) => (
                          <button
                            key={intent}
                            disabled={!!dispatching}
                            onClick={(e) => { e.stopPropagation(); handleDispatch(key, intent) }}
                            className="intent-btn text-[length:var(--text-micro)] tracking-[0.5px] uppercase"
                          >
                            {dispatching === `${key}:${intent}` ? '…' : intent.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-[var(--text-muted)] py-8 text-sm">
              No projects found. Add entries to your <span className="font-mono">agent-projects.conf</span>.
            </div>
          )}
        </div>

        {/* Command bar + custom prompt */}
        <div className="mt-8">
          <div className="runner-label mb-2">COMMAND</div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="next best thing for project-x"
              className="runner-input flex-1"
              onKeyDown={(e) => {
                const target = selectedProject || projectKeys[0]
                if (e.key === 'Enter' && e.currentTarget.value.trim() && target) {
                  handleDispatch(target, 'custom', e.currentTarget.value.trim())
                  e.currentTarget.value = ''
                }
              }}
            />
            <button onClick={handlePing} className="runner-btn text-xs tracking-widest px-5">
              PING
            </button>
          </div>
          <div className="text-[length:var(--text-micro)] text-[var(--text-muted)] mt-1.5">Type a prompt or intent. Selected project (or first) will be used.</div>
        </div>

        {/* Functioning dispatch result — nice card instead of raw blob */}
        {lastDispatch && (
          <div className="runner-card mt-6 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="runner-label">DISPATCH RESULT</div>
              <div className={`text-[length:var(--text-micro)] px-2 py-0.5 rounded ${lastDispatch.injected ? 'bg-emerald-900 text-emerald-400' : 'bg-amber-900 text-amber-400'}`}>
                {lastDispatch.injected ? 'INJECTED' : 'MANUAL PASTE NEEDED'}
              </div>
            </div>

            {lastDispatch.renderedPrompt && (
              <div className="mb-4">
                <div className="runner-label mb-1.5">PROMPT SENT TO AGENT</div>
                <div className="runner-result text-[var(--text)] whitespace-pre-wrap max-h-48 overflow-auto border border-[var(--border)]">
                  {lastDispatch.renderedPrompt}
                </div>
              </div>
            )}

            <div className="text-[length:var(--text-micro)] text-[var(--text-muted)]">
              project: {lastDispatch.projectKey} · intent: {lastDispatch.intent} · runId: {lastDispatch.runId?.slice(0,8) || '—'}
            </div>
          </div>
        )}

        {/* Error / other responses */}
        {response && (
          <div className="runner-result mt-4 text-[var(--text-muted)] whitespace-pre-wrap overflow-auto max-h-56 text-xs border border-[var(--border)]">
            {response}
          </div>
        )}

        <div className="mt-16 text-center text-[length:var(--text-micro)] tracking-[2px] text-[var(--text-muted)]">
          BUILT FOR BUILDERS WHO RUN REAL FLEETS<br />
          <span className="text-[9px] opacity-60">Requires: zellij + at least one agent CLI (claude, codex, etc.) on PATH. Embedded watcher for handoffs active.</span>
        </div>
      </div>
    </div>
  )
}

export default App
