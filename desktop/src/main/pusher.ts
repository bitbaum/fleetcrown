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

import { getZellijTabs } from '@/lib/zellij'
import { APP_URL } from '@/config/brand'
import { DAEMON_HEARTBEAT_MS } from '@/lib/constants/daemon'
import { parseProjectsConf, resolveEffectiveTab } from '@/lib/agent-config'
import { getAgentProcesses, readFastState } from '@/lib/control-fast-state'
import { listAgentRegistry } from '@/lib/agent-registry'
import { loadToken, clearToken } from './token-store'

// v0.6 — liveness heartbeat ONLY. Actual state changes are pushed via
// pushNow() the moment the watcher detects an agent file change (wired
// from index.ts's onIdle hook). So the steady-state cadence is one
// heartbeat every five minutes plus N pushes per real event. For an
// idle fleet (most minutes), the total drops from one push per minute
// (v0.5) to one push per five minutes (v0.6) — 5× reduction on the
// always-on heartbeat path.
//
// The web's daemon-offline threshold is now derived from this cadence in
// lib/constants/daemon.ts — see DAEMON_OFFLINE_THRESHOLD_MS. Pre-2026-06-06
// they were edited independently and disagreed (90s threshold against a
// 5min heartbeat), causing flicker. Bumping THIS constant auto-bumps the
// threshold to the right multiple.
const PUSH_INTERVAL_MS = DAEMON_HEARTBEAT_MS

const BASE_URL = (process.env.FLEETCROWN_WEB_URL || '').trim() || APP_URL

let timer: NodeJS.Timeout | null = null
let stopped = false

async function pushOnce(): Promise<void> {
  const token = loadToken()
  if (!token) return

  let openTabs: string[] = []
  let projects: ReturnType<typeof buildProjectRuntimePayload> = []
  let installedAgents: string[] = []
  try {
    openTabs = await getZellijTabs()
  } catch {
    // No Zellij running, tab query failed — push anyway with an empty list
    // so the daemon presence signal still gets through.
  }
  try {
    installedAgents = listAgentRegistry()
      .filter((entry) => entry.available)
      .map((entry) => entry.id)
    projects = buildProjectRuntimePayload(openTabs)
  } catch (err) {
    // Rich project state is best-effort. Keep the openTabs heartbeat flowing
    // so the web UI can still show the daemon as connected.
    console.warn('[pusher] project runtime snapshot failed:', (err as Error).message)
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
        installedAgents,
        projects,
        observedAt: Date.now(),
      }),
    })
    if (resp.status === 401 || resp.status === 403) {
      // Token is dead — the server doesn't recognize it. Delete the file
      // so FleetRunnerAutoMint can mint a fresh one next time /control loads
      // (its bail check is "if (existing) return", which used to keep the
      // user stuck with a permanently-rejected token).
      console.warn('[pusher] runtime-state token rejected; clearing stale token + stopping pusher')
      clearToken()
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

type ProjectRuntimePayload = {
  tab: string
  observedAt: number
  agentRunning: boolean
  tabOpen: boolean
  activeAgents: string[]
  currentPromptKey?: string | null
  currentPromptLabel?: string | null
  currentPromptStartedAt?: number | null
  readyAt?: number | null
  lockAt?: number | null
  closingAt?: number | null
  closedAt?: number | null
  sessionDone?: string
  sessionStatus?: string
  sessionNext?: string
  sessionTests?: string
  sessionTodos?: string
  sessionHealth?: string
  sessionUpdatedAt?: number | null
}

function buildProjectRuntimePayload(openTabs: string[]): ProjectRuntimePayload[] {
  const agentRegistry = listAgentRegistry()
  const agentProcesses = getAgentProcesses(agentRegistry)
  const projects = parseProjectsConf().map(({ tab, dir }) => {
    const resolvedTab = resolveEffectiveTab(tab, openTabs)
    const projectProcesses = agentProcesses.filter((p) => p.cwd === dir || p.cwd.startsWith(`${dir}/`))
    const activeAgents = [...new Set(projectProcesses.map((p) => p.agentId))]
    const agentId = activeAgents[0]
    const registryEntry = agentId ? agentRegistry.find((entry) => entry.id === agentId) : null
    return {
      canonicalTab: tab,
      tab: resolvedTab,
      dir,
      activeAgents,
      sessionLifecycleSignals: projectProcesses.length > 0
        ? projectProcesses.some((p) => p.sessionLifecycleSignals)
        : registryEntry?.capabilities.sessionLifecycleSignals ?? true,
      tabOpen: openTabs.some((openTab) => openTab.toLowerCase() === resolvedTab.toLowerCase()),
    }
  })
  const agentCwds = agentProcesses.map((p) => p.cwd)
  const observedAt = Date.now()
  return readFastState(projects, agentCwds).map((state, index) => ({
    tab: projects[index]?.canonicalTab ?? state.tab,
    observedAt,
    agentRunning: state.agentRunning,
    tabOpen: state.tabOpen,
    activeAgents: state.activeAgents,
    currentPromptKey: state.currentPrompt?.key ?? null,
    currentPromptLabel: state.currentPrompt?.label ?? null,
    currentPromptStartedAt: state.currentPrompt?.startedAt ?? null,
    readyAt: state.readyAt,
    lockAt: state.lockAt,
    closingAt: state.closingAt,
    closedAt: state.closedAt,
    sessionStatus: state.session?.status,
    sessionDone: state.session?.done,
    sessionNext: state.session?.next,
    sessionTests: state.session?.tests,
    sessionTodos: state.session?.todos,
    sessionHealth: state.session?.health,
    sessionUpdatedAt: state.session?.mtime ? Math.floor(state.session.mtime / 1000) : null,
  }))
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

/**
 * Force an immediate push outside the heartbeat schedule. Called when
 * a local event occurred that the cloud should learn about NOW — e.g.,
 * an agent went idle (worker.idle from the embedded watcher), a Zellij
 * tab opened or closed, or a deep-link auth just landed a new token.
 *
 * Coalesced via a tiny lock: if a push is already in-flight, the next
 * call skips. The next event after the in-flight one finishes triggers
 * a fresh push. This stops a burst (e.g., three handoffs in two seconds)
 * from queuing three round-trips to the cloud — one is enough because
 * the payload sends the whole openTabs list anyway.
 */
let pushNowInFlight = false
export async function pushNow(): Promise<void> {
  if (stopped || pushNowInFlight) return
  pushNowInFlight = true
  try {
    await pushOnce()
  } finally {
    pushNowInFlight = false
  }
}

/** Called when a new token is saved (paste flow, deep-link auth). */
export function restartPusher(): void {
  stopPusher()
  startPusher()
}
