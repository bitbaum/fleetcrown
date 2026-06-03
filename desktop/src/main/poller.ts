/**
 * Fleet Runner main-process poller.
 *
 * Long-polls the FleetCrown control plane for commands queued by the web
 * (`pending_commands` rows from `executeInject`'s remote branch) and executes
 * them locally via the same `injectIntoTab` primitive the bash daemon uses.
 * This is the cable that closes the loop: a user dispatches from any browser
 * or phone, the row lands in Neon, this poller drains it in <1s, the prompt
 * fires into the user's Zellij pane.
 *
 * Protocol (already proven by scripts/fleetcrown-daemon.sh):
 *   GET   /api/control/commands?wait=25   →  { command: { id, type, payload } | null }
 *   PATCH /api/control/commands/<id>      ←  { ok: boolean, error?, text? }
 *
 * Auth: Bearer <token> where <token> is the ck_… string created from
 * Settings → Agent tokens (and saved here at ~/.config/fleetcrown/fleet-runner-token).
 *
 * v1 handles the `inject` command type — the path /api/inject takes for any
 * web/phone dispatch when the server is on Vercel. Other types (focus_tab,
 * launch_agent, switch_agent, repair_helper, auto_continue) are deferred and
 * report a clear "not yet supported" error so the row gets cleared from the
 * queue instead of silently jamming it; users who need those types can still
 * run the bash daemon in parallel (atomic claim via FOR UPDATE SKIP LOCKED
 * means each command goes to exactly one drainer).
 */

import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { injectIntoTab } from '@/lib/zellij'
import { APP_URL } from '@/config/brand'

const CONFIG_DIR = join(homedir(), '.config', 'fleetcrown')
const TOKEN_FILE = join(CONFIG_DIR, 'fleet-runner-token')

export type PollerState = 'idle' | 'connecting' | 'connected' | 'error'

export type PollerStatus = {
  state: PollerState
  baseUrl: string
  /** ms epoch of the last successful poll response (command or empty) */
  lastPollAt: number | null
  /** ms epoch of the most recent error */
  lastErrorAt: number | null
  /** Human-readable error message — never include the token */
  lastError: string | null
  /** First 12 chars + "…" so the UI can show which token is in use, never the full secret */
  tokenPrefix: string | null
  /** Number of commands successfully executed in this run */
  commandsHandled: number
  /** Number of commands rejected (unsupported type, etc.) */
  commandsRejected: number
}

type StatusListener = (s: PollerStatus) => void

const listeners = new Set<StatusListener>()
let currentStatus: PollerStatus = {
  state: 'idle',
  baseUrl: (process.env.FLEETCROWN_WEB_URL || '').trim() || APP_URL,
  lastPollAt: null,
  lastErrorAt: null,
  lastError: null,
  tokenPrefix: null,
  commandsHandled: 0,
  commandsRejected: 0,
}
let abortCtrl: AbortController | null = null
let running = false

export function onPollerStatus(cb: StatusListener): () => void {
  listeners.add(cb)
  // Fire immediately so subscribers don't wait for the next change.
  try { cb(currentStatus) } catch { /* listener should not throw */ }
  return () => { listeners.delete(cb) }
}

export function getPollerStatus(): PollerStatus {
  return { ...currentStatus }
}

function updateStatus(patch: Partial<PollerStatus>): void {
  currentStatus = { ...currentStatus, ...patch }
  for (const cb of listeners) {
    try { cb(currentStatus) } catch { /* listener should not throw */ }
  }
}

function loadToken(): string | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null
    const t = readFileSync(TOKEN_FILE, 'utf8').trim()
    return t || null
  } catch {
    return null
  }
}

/**
 * Start the poller. Idempotent — calling while already running is a no-op.
 * If no token is saved, transitions to `idle` and waits for `restartPoller()`
 * (called when the user pastes a token or the auto-mint flow saves one).
 */
export function startPoller(): void {
  if (running) return
  const token = loadToken()
  if (!token) {
    updateStatus({ state: 'idle', tokenPrefix: null, lastError: null, lastErrorAt: null })
    return
  }
  running = true
  abortCtrl = new AbortController()
  updateStatus({
    state: 'connecting',
    tokenPrefix: token.slice(0, 12) + '…',
    lastError: null,
    lastErrorAt: null,
  })
  void runLoop(token, abortCtrl.signal)
}

export function stopPoller(): void {
  if (!running && !abortCtrl) return
  running = false
  abortCtrl?.abort()
  abortCtrl = null
  updateStatus({ state: 'idle' })
}

export function restartPoller(): void {
  stopPoller()
  startPoller()
}

async function runLoop(token: string, signal: AbortSignal): Promise<void> {
  const base = currentStatus.baseUrl
  // Backoff for connection errors — successful polls reset it. The long-poll
  // already paces normal traffic to ~one request per 25s when there's no work.
  let backoffMs = 1_000

  while (!signal.aborted && running) {
    try {
      const resp = await fetch(`${base}/api/control/commands?wait=25`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })

      if (resp.status === 401 || resp.status === 403) {
        // Token rejected — pollster's role is over until the user pastes a
        // fresh one. Surface a clear message instead of looping forever.
        updateStatus({
          state: 'error',
          lastError: `Token rejected (${resp.status}). Create a new one in Settings → Agent tokens.`,
          lastErrorAt: Date.now(),
        })
        running = false
        return
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} from /api/control/commands`)
      }

      // Successful connection — clear any prior error state.
      updateStatus({
        state: 'connected',
        lastPollAt: Date.now(),
        lastError: null,
        lastErrorAt: null,
      })
      backoffMs = 1_000

      const data = (await resp.json()) as { command: { id: string; type: string; payload: unknown } | null }
      if (data.command) {
        await handleCommand(base, token, data.command)
      }
    } catch (err) {
      if (signal.aborted) return
      const msg = (err as Error).message || 'unknown error'
      updateStatus({
        state: 'error',
        lastError: msg,
        lastErrorAt: Date.now(),
      })
      await new Promise<void>((r) => setTimeout(r, backoffMs))
      backoffMs = Math.min(backoffMs * 2, 30_000)
    }
  }
}

async function handleCommand(
  base: string,
  token: string,
  command: { id: string; type: string; payload: unknown },
): Promise<void> {
  let ok = false
  let error: string | undefined

  try {
    switch (command.type) {
      case 'inject': {
        const { tab, prompt } = command.payload as { tab?: string; prompt?: string }
        if (!tab || !prompt) {
          ok = false
          error = `Malformed inject payload: tab and prompt are required.`
          break
        }
        injectIntoTab(tab, prompt)
        ok = true
        break
      }
      default: {
        // Unsupported types: mark failed with an actionable message instead of
        // letting them re-claim after the 90s stale-claim window — that would
        // jam the queue. Users who need full command-type coverage can run the
        // bash daemon (the atomic claim ensures the two drainers don't collide).
        ok = false
        error =
          `Fleet Runner v0.1 does not yet handle command type '${command.type}'. ` +
          `Run scripts/fleetcrown-daemon.sh for full command coverage, or wait for the next release.`
        break
      }
    }
  } catch (e) {
    ok = false
    error = (e as Error).message
  }

  // PATCH the row done regardless of outcome — claiming without acking would
  // leave a half-finished row that only recovers via the 90s stale-claim
  // reaper. Surfacing the error to the web UI is more useful.
  try {
    await fetch(`${base}/api/control/commands/${command.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ok, ...(error ? { error } : {}) }),
    })
  } catch (e) {
    // If we can't reach the server to mark done, the next poll will retry the
    // command — that's safe because `injectIntoTab` is idempotent at the user
    // level (the duplicate prompt just gets ignored or re-sent — not data loss).
    console.warn('[poller] failed to PATCH command done:', (e as Error).message)
  }

  if (ok) {
    updateStatus({ commandsHandled: currentStatus.commandsHandled + 1 })
  } else {
    updateStatus({ commandsRejected: currentStatus.commandsRejected + 1 })
  }
}

/**
 * Format a tray tooltip from the live status. Pure function so the index/main
 * module can call it without re-implementing the UX shape.
 */
export function formatTrayTooltip(s: PollerStatus): string {
  const head = 'Fleet Runner'
  switch (s.state) {
    case 'idle':
      return `${head} · waiting for token (paste from Settings → Agent tokens)`
    case 'connecting':
      return `${head} · connecting…`
    case 'connected': {
      const ago = s.lastPollAt ? Math.max(0, Math.floor((Date.now() - s.lastPollAt) / 1000)) : null
      const counter = s.commandsHandled > 0 ? ` · ${s.commandsHandled} ran` : ''
      return `${head} · connected${ago !== null ? ` · last poll ${ago}s ago` : ''}${counter}`
    }
    case 'error':
      return `${head} · ${s.lastError ?? 'error'}`
  }
}
