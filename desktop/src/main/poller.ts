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
import { startBridgeSubscriber } from './bridge-subscriber'
import { validateCommand } from './command-validator'

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
// Two abort controllers, two scopes:
//   - lifetimeCtrl: outer — aborts on stopPoller(). Cancels everything.
//   - currentFetchCtrl: inner — per-iteration. Bridge-wake aborts THIS one
//     so the loop continues with a fresh fast-drain fetch.
let lifetimeCtrl: AbortController | null = null
let currentFetchCtrl: AbortController | null = null
let running = false
let bridgeHandle: { stop: () => void } | null = null
// Set by the bridge subscriber when a pending_commands INSERT arrives. The
// loop drops the next wait=25 and uses wait=0 to drain immediately.
let pendingWake = false

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
  lifetimeCtrl = new AbortController()
  updateStatus({
    state: 'connecting',
    tokenPrefix: token.slice(0, 12) + '…',
    lastError: null,
    lastErrorAt: null,
  })
  // Open the bridge SSE subscription alongside the long-poll loop. The
  // bridge is the fast path (<500ms after INSERT); the long-poll is the
  // safety net. Both drain the same /api/control/commands endpoint with
  // FOR UPDATE SKIP LOCKED, so commands go to exactly one consumer.
  bridgeHandle = startBridgeSubscriber(token, {
    onCommandPending: () => {
      // Wake the long-poll loop by aborting the in-flight wait=25 request.
      // The loop's next iteration sees pendingWake and uses wait=0 to drain
      // the queue immediately. Aborting the inner controller (not lifetime)
      // keeps the loop alive.
      pendingWake = true
      currentFetchCtrl?.abort()
    },
  })
  void runLoop(token, lifetimeCtrl.signal)
}

export function stopPoller(): void {
  if (!running && !lifetimeCtrl && !bridgeHandle) return
  running = false
  lifetimeCtrl?.abort()
  lifetimeCtrl = null
  currentFetchCtrl?.abort()
  currentFetchCtrl = null
  bridgeHandle?.stop()
  bridgeHandle = null
  pendingWake = false
  updateStatus({ state: 'idle' })
}

export function restartPoller(): void {
  stopPoller()
  startPoller()
}

async function runLoop(token: string, lifetimeSignal: AbortSignal): Promise<void> {
  const base = currentStatus.baseUrl
  // Backoff for connection errors — successful polls reset it. The long-poll
  // already paces normal traffic to ~one request per 25s when there's no work.
  let backoffMs = 1_000

  while (!lifetimeSignal.aborted && running) {
    // Fresh per-iteration controller so a bridge-wake aborts only this fetch,
    // not the loop. pendingWake collapses the next wait=25 to wait=0 — the
    // bridge already told us there's a row to drain.
    currentFetchCtrl = new AbortController()
    const wakeRequested = pendingWake
    pendingWake = false
    const waitSec = wakeRequested ? 0 : 25
    try {
      const resp = await fetch(`${base}/api/control/commands?wait=${waitSec}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: currentFetchCtrl.signal,
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
      // Two abort sources: lifetimeSignal (stopPoller — exit) vs.
      // currentFetchCtrl (bridge-wake — continue with wait=0 next iter).
      if (lifetimeSignal.aborted) return
      if (currentFetchCtrl?.signal.aborted) continue
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

  // Validate at the IPC boundary BEFORE touching any executor. Pre-v0.7
  // the payload was an unchecked cast; once the autonomous scheduler (v0.7+)
  // starts queuing pending_commands unattended, an unchecked cast lets a
  // typo'd cron payload through to injectIntoTab() which would fail in a
  // less actionable place. See command-validator.ts for the contract.
  const validation = validateCommand(command)
  if (!validation.ok) {
    error = validation.error
  } else try {
    switch (validation.command.type) {
      case 'inject': {
        injectIntoTab(validation.command.payload.tab, validation.command.payload.prompt)
        ok = true
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
