/**
 * Fleet Runner runtime-state pusher.
 *
 * The cloud control plane shows "Local daemon offline" until somebody POSTs
 * to /api/control/runtime-state with this user's bearer token. v0.4.0 — v0.4.3
 * shipped the poller (cloud → local commands) but not the pusher (local →
 * cloud heartbeat), so the web UI rendered the daemon as offline even when
 * Fleet Runner was running and the poller was happily long-polling. Dispatch
 * still worked, but the user couldn't tell the daemon was alive.
 *
 * This pusher fixes that. Every PUSH_INTERVAL_MS it sends:
 *   - openTabs: live list of Zellij tab names (so /control's per-project
 *     "tab open" badges stay accurate)
 *   - projects: empty array (per-project session details are written by
 *     the embedded watcher to its own table; this pusher only signals
 *     daemon presence)
 *   - observedAt: ms epoch
 *
 * On 401/403 we stop — token is invalid and retrying is pointless until the
 * user pastes a new one (which calls restartPusher via the same hook the
 * poller uses). All other transient errors swallow silently and continue —
 * the daemon's "offline" UI label is the worst case, no data is lost.
 *
 * Why not piggyback on the poller? Conceptual: poller is reactive (waits for
 * commands), pusher is active (announces presence). Coupling them means a
 * dispatch-light user with no queued work would never push because the
 * poller blocks on the long-poll for 25s at a time, and during that block
 * the pusher's 30s cadence would slip. Two timers, two responsibilities.
 */

import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { getZellijTabs } from '@/lib/zellij'
import { APP_URL } from '@/config/brand'

const CONFIG_DIR = join(homedir(), '.config', 'fleetcrown')
const TOKEN_FILE = join(CONFIG_DIR, 'fleet-runner-token')

// 30s is a balance between freshness on the web UI ("sync 12s ago" feels
// live) and not hammering the cloud when nothing's happening. The existing
// `daemonOffline` check considers >90s without a push as offline.
const PUSH_INTERVAL_MS = 30_000

const BASE_URL = (process.env.FLEETCROWN_WEB_URL || '').trim() || APP_URL

let timer: NodeJS.Timeout | null = null
let stopped = false

function loadToken(): string | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null
    const t = readFileSync(TOKEN_FILE, 'utf8').trim()
    return t || null
  } catch {
    return null
  }
}

async function pushOnce(): Promise<void> {
  const token = loadToken()
  if (!token) return

  let openTabs: string[] = []
  try {
    openTabs = await getZellijTabs()
  } catch {
    // No Zellij running, tab query failed — push anyway with an empty list
    // so the daemon presence signal still gets through.
  }

  try {
    const resp = await fetch(`${BASE_URL}/api/control/runtime-state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        openTabs,
        projects: [],
        observedAt: Date.now(),
      }),
    })
    if (resp.status === 401 || resp.status === 403) {
      console.warn('[pusher] runtime-state token rejected; stopping pusher')
      stopPusher()
      return
    }
    if (!resp.ok) {
      // Transient — log once, keep going on next tick.
      console.warn(`[pusher] runtime-state POST ${resp.status}`)
    }
  } catch (err) {
    // Network blip, DNS failure, etc. — non-fatal, retry next tick.
    console.warn('[pusher] runtime-state push failed:', (err as Error).message)
  }
}

/**
 * Start the runtime-state pusher. Idempotent — calling while already running
 * is a no-op. Fires once immediately (so the daemon shows online within
 * seconds of launch, not after the first 30s tick) then every
 * PUSH_INTERVAL_MS.
 */
export function startPusher(): void {
  if (timer) return
  stopped = false
  // Fire-and-forget: don't await on launch so we don't delay the rest of
  // whenReady. Subsequent pushes are also fire-and-forget.
  void pushOnce()
  timer = setInterval(() => {
    if (!stopped) void pushOnce()
  }, PUSH_INTERVAL_MS)
}

export function stopPusher(): void {
  stopped = true
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** Called when a new token is saved (paste flow, deep-link auth). */
export function restartPusher(): void {
  stopPusher()
  startPusher()
}
