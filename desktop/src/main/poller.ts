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
 * The desktop poller handles the same core command set as the bash daemon:
 * inject, focus/close tab, launch/switch agent, auto-continue, and install
 * CLI. This is what makes the hosted web app and phone UI a real remote for
 * the local Zellij workspace instead of just an inject-only transport.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execSync } from 'child_process'
import { injectIntoTab, sendRawKey, shellEscape, getZellijSessionsSync, peekTab as peekZellijTab } from '@/lib/zellij'
import { zellijExecutableForShell } from '@/lib/terminals/zellij'
import { APP_URL } from '@/config/brand'
import { APP_SLUG } from '@/config/brand'
import { launchAgentInTab } from '@/lib/agent-runtime'
import { startPeek, stopPeek } from './peek-streamer'
import { getAgentInstallCommand, isAgentId, listAgentRegistry, type Agent, type AgentOption } from '@/lib/agent-registry'
import { resolveOutgoingAgentForDir, resolveRunningAgentsInDir } from '@/lib/agent-process-scan'
import { startBridgeSubscriber } from './bridge-subscriber'
import { validateCommand } from './command-validator'
import { loadToken, clearToken } from './token-store'
import { ensureZellijReady } from '@/lib/zellij-bootstrap'
import { FLEET_RUNNER_COMMAND_TYPES_PARAM } from '@/lib/pending-command-contract'

/** Where Claude (and our handoff parser) writes the per-tab session file.
 *  Used by post-flight verification: if the file's mtime advances within a
 *  few seconds of an inject, we know the agent received and reacted. */
const SESSIONS_DIR =
  process.env.APP_SESSIONS_DIR ?? path.join(os.homedir(), '.claude', 'sessions')

const DEFAULT_SESSION_NAME = 'fleet'
const COMMAND_DEDUP_DIR = path.join(os.tmpdir())
function dedupSentinelPath(commandId: string): string {
  return path.join(COMMAND_DEDUP_DIR, `fc-cmd-${commandId}.done`)
}

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
const COMMAND_POLL_IDLE_MS = 2_000
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


/**
 * Start the poller. Idempotent — calling while already running is a no-op.
 * If no token is saved, transitions to `idle` and waits for `restartPoller()`
 * (called when the user pastes a token or the auto-mint flow saves one).
 */
export function startPoller(): void {
  if (running) return
  const token = loadToken()
  if (!token) {
    console.warn('[poller] not started: no saved token')
    updateStatus({ state: 'idle', tokenPrefix: null, lastError: null, lastErrorAt: null })
    return
  }
  console.log(`[poller] starting against ${currentStatus.baseUrl} with token ${token.slice(0, 12)}…`)
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
        // Wake the polling loop by aborting the in-flight request/sleep. The
        // loop always drains with wait=0; this just removes up to 2s of idle
        // delay when the bridge is healthy.
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
  console.log(`[poller] loop started; short-poll idle=${COMMAND_POLL_IDLE_MS}ms`)
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
    try {
      // Use wait=0 short polling. The production long-poll/SSE path is the
      // right architecture eventually, but dogfood showed it can leave desktop
      // commands claimed without visible progress under Vercel/bridge edge
      // conditions. A 2s deterministic poll is cheap and makes phone/web
      // control reliable today.
      const resp = await fetch(`${base}/api/control/commands?wait=0&types=${encodeURIComponent(FLEET_RUNNER_COMMAND_TYPES_PARAM)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: currentFetchCtrl.signal,
      })

      if (resp.status === 401 || resp.status === 403) {
        // Token is dead — clear the stale file so the next auto-mint cycle
        // (FleetRunnerAutoMint, which gates on "no existing token") can
        // issue a fresh one from the user's signed-in session instead of
        // leaving them permanently offline. Pre-fix: poller stopped but the
        // bad token persisted, and auto-mint's "if (existing) return" guard
        // kept it stuck. The same fix landed in pusher.ts.
        console.warn(`[poller] token rejected (${resp.status}); clearing stale token + stopping`)
        clearToken()
        updateStatus({
          state: 'error',
          lastError: `Token rejected (${resp.status}). Reload the app — auto-mint will issue a fresh token from your signed-in session.`,
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
        console.log(`[poller] claimed ${data.command.type} command ${data.command.id}`)
        await handleCommand(base, token, data.command)
      } else if (!wakeRequested) {
        await new Promise<void>((r) => setTimeout(r, COMMAND_POLL_IDLE_MS))
      }
    } catch (err) {
      // Two abort sources: lifetimeSignal (stopPoller — exit) vs.
      // currentFetchCtrl (bridge-wake — continue with wait=0 next iter).
      if (lifetimeSignal.aborted) return
      if (currentFetchCtrl?.signal.aborted) continue
      const msg = (err as Error).message || 'unknown error'
      console.warn('[poller] loop error:', msg)
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

/**
 * Pre-flight: ensure a zellij session is alive before we try to inject
 * into it. If the session died (PC restart with poller still queueing
 * commands, user did `zellij kill-all-sessions`, etc.) bootstrap one
 * from an empty layout. Tabs get created on-demand by the existing
 * launch/inject paths. Cheap when the session is already live — just a
 * `zellij list-sessions` shellout.
 */
async function ensureSessionForCommand(): Promise<void> {
  // If ANY zellij session is already live, we're done — inject/launch resolve
  // the target tab across all sessions (injectIntoTab → findSessionForTab), so
  // they drive the user's own session (e.g. their interactive one) without
  // needing the runner's dedicated 'fleet' session. Only bootstrap 'fleet' when
  // zellij is entirely down (the "rebooted, nothing running" self-heal path).
  //
  // Forcing a 'fleet' fresh-spawn on every command was a real bug: on a box
  // where headless 'fleet' won't spawn, the spawn-wait failed and injects never
  // landed even though the user had a perfectly good live session. The comment
  // above always intended "a zellij session", not "the fleet session".
  if (getZellijSessionsSync().length > 0) return
  await ensureZellijReady(DEFAULT_SESSION_NAME, [], { mode: 'fresh-spawn' })
}

/**
 * Post-flight verification for `inject`: did the agent actually receive
 * the prompt? Cheap heuristic — claude (and our session.md format) bump
 * the session file's mtime when an agent picks up a prompt. We snapshot
 * mtime before injection then poll for up to 5s. If it advances → the
 * agent received it. If not → injection landed in a shell, a stalled
 * agent, or zellij ate it.
 *
 * Returns the verification verdict; the caller decides what to do with it.
 */
function sessionFilePath(tab: string): string {
  return path.join(SESSIONS_DIR, `${tab}.md`)
}

function readMtimeMs(file: string): number {
  try { return fs.statSync(file).mtimeMs } catch { return 0 }
}

async function waitForSessionFileBump(tab: string, baselineMtime: number, timeoutMs = 5000): Promise<boolean> {
  const file = sessionFilePath(tab)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const cur = readMtimeMs(file)
    if (cur > baselineMtime) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

/**
 * PATCH the pending_commands row done. Always called once per command
 * (success, error, or already-done dedup hit) so a claimed row never
 * lingers waiting for the 90s stale-claim reaper.
 */
type AckPayload = { ok: boolean; error?: string; text?: string; verified?: boolean; warning?: string }

async function ackCommand(
  base: string,
  token: string,
  command: { id: string; type: string },
  body: AckPayload,
): Promise<void> {
  try {
    console.log(`[poller] acking ${command.type} command ${command.id}: ${body.ok ? 'ok' : 'error'}${body.warning ? ` (${body.warning})` : ''}`)
    await fetch(`${base}/api/control/commands/${command.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ok: body.ok,
        ...(body.error ? { error: body.error } : {}),
        ...(body.text !== undefined ? { text: body.text } : {}),
        ...(body.verified !== undefined ? { verified: body.verified } : {}),
        ...(body.warning ? { warning: body.warning } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (e) {
    // If we can't reach the server to mark done, the next poll will retry the
    // command — the dedup sentinel above keeps the agent from running it twice.
    console.warn('[poller] failed to PATCH command done:', (e as Error).message)
  }
}

async function handleCommand(
  base: string,
  token: string,
  command: { id: string; type: string; payload: unknown },
): Promise<void> {
  let ok = false
  let error: string | undefined
  let verified: boolean | undefined
  let warning: string | undefined

  // Idempotency dedup. If the PATCH ack timed out on a previous run, the
  // server will hand us the same command again. Without this, the prompt
  // fires twice — which CAN be data loss (the agent runs both copies).
  // The sentinel survives across poller restarts but not reboots; that's
  // the right window (after reboot, queued commands are stale enough that
  // re-dispatch is fine).
  const sentinel = dedupSentinelPath(command.id)
  if (fs.existsSync(sentinel)) {
    console.log(`[poller] dedup hit for ${command.type} ${command.id} — already done, acking only`)
    await ackCommand(base, token, command, { ok: true, warning: 'already-done' })
    return
  }

  // Validate at the IPC boundary BEFORE touching any executor. Pre-v0.7
  // the payload was an unchecked cast; once the autonomous scheduler (v0.7+)
  // starts queuing pending_commands unattended, an unchecked cast lets a
  // typo'd cron payload through to injectIntoTab() which would fail in a
  // less actionable place. See command-validator.ts for the contract.
  const validation = validateCommand(command)
  if (!validation.ok) {
    error = validation.error
  } else try {
    // Pre-flight: zellij has to be alive for any of these to land. Self-heals
    // the "I rebooted and nothing's running" path so the user doesn't have
    // to open a terminal first.
    const t = validation.command.type
    if (t === 'inject' || t === 'launch_agent' || t === 'switch_agent' || t === 'focus_tab' || t === 'close_tab' || t === 'install_cli') {
      await ensureSessionForCommand()
    }
    switch (validation.command.type) {
      case 'inject': {
        const { tab, prompt } = validation.command.payload
        const baseline = readMtimeMs(sessionFilePath(tab))
        injectIntoTab(tab, prompt)
        ok = true
        // Post-flight verification — best effort, doesn't block the ack on
        // failure (we still report ok:true because the keystrokes landed).
        verified = await waitForSessionFileBump(tab, baseline, 5000)
        if (!verified) {
          warning = 'delivered but agent did not pick up within 5s (agent may be hung or idle)'
        }
        break
      }
      case 'focus_tab': {
        focusWorkspaceTab(validation.command.payload.tab)
        ok = true
        break
      }
      case 'close_tab': {
        closeTab(validation.command.payload.tab)
        ok = true
        break
      }
      case 'launch_agent': {
        const { tab, dir, agent, model, initialPrompt } = validation.command.payload
        assertKnownLaunchAgent(agent)
        launchAgentInTab(tab, dir, agent as AgentOption, model)
        clearHandoffSentinel(tab)
        if (initialPrompt?.trim()) {
          setTimeout(() => {
            try { injectIntoTab(tab, initialPrompt.trim()) } catch (e) { console.warn('[poller] initial prompt after launch failed:', (e as Error).message) }
          }, 2500)
        }
        ok = true
        break
      }
      case 'switch_agent': {
        const { tab, dir, toAgent, fromAgent, model } = validation.command.payload
        assertKnownLaunchAgent(toAgent)
        switchAgent(tab, dir, toAgent as AgentOption, fromAgent, model)
        ok = true
        break
      }
      case 'auto_continue': {
        applyAutoContinue(validation.command.payload.tab, validation.command.payload.enabled)
        ok = true
        break
      }
      case 'install_cli': {
        openInstallerTab(validation.command.payload.agent)
        ok = true
        break
      }
      case 'peek_tab': {
        const { tab } = validation.command.payload
        const content = peekZellijTab(tab)
        ok = true
        await ackCommand(base, token, command, { ok, text: content })
        console.log(`[poller] handled ${command.type} command ${command.id}`)
        updateStatus({ commandsHandled: currentStatus.commandsHandled + 1 })
        return
      }
      case 'peek_start': {
        // Live terminal: start streaming this tab's screen to the cloud until a
        // peek_stop (last viewer left). See docs/architecture/embedded-terminal.md.
        startPeek(base, token, validation.command.payload.tab)
        ok = true
        break
      }
      case 'peek_stop': {
        stopPeek(validation.command.payload.tab)
        ok = true
        break
      }
    }
  } catch (e) {
    ok = false
    error = (e as Error).message
  }

  // Drop the dedup sentinel on success so a re-served command (PATCH ack
  // race) doesn't get re-executed. Skip for error paths because retry is
  // the right behavior there.
  if (ok) {
    try { fs.writeFileSync(sentinel, '1', 'utf-8') } catch { /* tmpdir unwritable — fall back to "best effort" */ }
  }

  await ackCommand(base, token, command, { ok, error, verified, warning })

  if (ok) {
    console.log(`[poller] handled ${command.type} command ${command.id}`)
    updateStatus({ commandsHandled: currentStatus.commandsHandled + 1 })
  } else {
    console.warn(`[poller] rejected ${command.type} command ${command.id}: ${error ?? 'unknown error'}`)
    updateStatus({ commandsRejected: currentStatus.commandsRejected + 1 })
  }
}

function assertKnownLaunchAgent(agent: string): void {
  if (!listAgentRegistry().some((entry) => entry.id === agent && entry.capabilities.tabSwitching)) {
    throw new Error(`unknown or non-launchable agent: ${agent}`)
  }
}

function tabNamesForSession(session: string): string[] {
  const commands = [
    `${zellijExecutableForShell()} --session ${shellEscape(session)} action query-tab-names 2>/dev/null`,
    `ZELLIJ_SESSION_NAME=${shellEscape(session)} ${zellijExecutableForShell()} action query-tab-names 2>/dev/null`,
  ]
  for (const command of commands) {
    try {
      const out = execSync(command, { encoding: 'utf8', timeout: 2000 })
      const tabs = out.split('\n').map((line) => line.trim()).filter(Boolean)
      if (tabs.length > 0) return tabs
    } catch {
      // Try the next addressing mode.
    }
  }
  return []
}

function findSessionForTab(tab: string): string | null {
  for (const session of getZellijSessionsSync()) {
    if (tabNamesForSession(session).some((candidate) => candidate.toLowerCase() === tab.toLowerCase())) {
      return session
    }
  }
  return null
}

function firstZellijSession(): string {
  const session = getZellijSessionsSync()[0]
  if (!session) throw new Error('no zellij session found')
  return session
}

function focusWorkspaceTab(tab: string): void {
  const session = findSessionForTab(tab)
  if (!session) throw new Error(`tab not found: ${tab}`)
  const liveTab = tabNamesForSession(session).find((candidate) => candidate.toLowerCase() === tab.toLowerCase()) ?? tab
  execSync(`${zellijExecutableForShell()} --session ${shellEscape(session)} action go-to-tab-name ${shellEscape(liveTab)}`, { stdio: 'ignore', timeout: 3000 })
  waitForFocusedTab(session, liveTab)
}

function closeTab(tab: string): void {
  const session = findSessionForTab(tab)
  if (!session) throw new Error(`tab not found: ${tab}`)
  focusWorkspaceTab(tab)
  execSync('sleep 0.15')
  execSync(`${zellijExecutableForShell()} --session ${shellEscape(session)} action close-tab`, { stdio: 'ignore', timeout: 3000 })
  clearHandoffSentinel(tab)
}

function focusedTabForSession(session: string): string | null {
  try {
    return execSync(
      `${zellijExecutableForShell()} --session ${shellEscape(session)} action dump-layout 2>/dev/null | grep 'focus=true' | grep 'tab name=' | sed 's/.*tab name="\\([^"]*\\)".*/\\1/' | head -1`,
      { encoding: 'utf8', timeout: 2000 },
    ).trim() || null
  } catch {
    return null
  }
}

function waitForFocusedTab(session: string, tab: string): void {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    if (focusedTabForSession(session) === tab) return
    execSync('sleep 0.05', { timeout: 1000 })
  }
  throw new Error(`zellij tab "${tab}" did not gain focus`)
}

function newTab(session: string, tab: string): void {
  execSync(`${zellijExecutableForShell()} --session ${shellEscape(session)} action new-tab --name ${shellEscape(tab)}`, { stdio: 'ignore', timeout: 3000 })
  execSync('sleep 0.5')
}

function clearHandoffSentinel(tab: string): void {
  try { fs.unlinkSync(`/tmp/agent-handoff-sent-${tab}`) } catch { /* absent */ }
}

function autoContinueSentinel(tab: string): string {
  return `/tmp/${APP_SLUG}-auto-continue-${tab.toLowerCase()}`
}

function applyAutoContinue(tab: string, enabled: boolean): void {
  if (enabled) {
    try { fs.unlinkSync(autoContinueSentinel(tab)) } catch { /* absent */ }
  } else {
    fs.writeFileSync(autoContinueSentinel(tab), 'off', 'utf8')
  }
}

function openInstallerTab(agent: string): void {
  const command = getAgentInstallCommand(agent as AgentOption)
  if (!command) throw new Error(`unknown agent for install: ${agent}`)
  const label = listAgentRegistry().find((entry) => entry.id === agent)?.label ?? agent
  const tab = `Install ${label}`
  newTab(firstZellijSession(), tab)
  injectIntoTab(tab, command)
}

function isAgentProcess(entry: { processMatchers: readonly string[] }, argv0: string): boolean {
  const basename = argv0.includes('/') ? argv0.split('/').pop() ?? argv0 : argv0
  return entry.processMatchers.some((matcher) => basename === matcher || basename.startsWith(`${matcher}-`))
}

function agentRunningInDir(agent: string | undefined, dir: string): boolean {
  if (!agent || !isAgentId(agent)) return false
  const entry = listAgentRegistry().find((candidate) => candidate.id === agent)
  if (!entry) return false
  try {
    for (const proc of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(proc)) continue
      try {
        const argv0 = fs.readFileSync(`/proc/${proc}/cmdline`, 'utf8').split('\0')[0] ?? ''
        if (!isAgentProcess(entry, argv0)) continue
        const cwd = fs.readlinkSync(`/proc/${proc}/cwd`)
        if (cwd === dir || cwd.startsWith(`${dir}/`)) return true
      } catch {
        // Process disappeared or is not readable.
      }
    }
  } catch {
    // /proc unavailable.
  }
  return false
}

function sleep(ms: number): void {
  execSync(`sleep ${Math.max(0, ms / 1000)}`)
}

function quitAgentInTab(tab: string, agentId: Agent, dir: string): void {
  const registry = listAgentRegistry()
  const entry = registry.find((candidate) => candidate.id === agentId)
  if (!entry || entry.id === 'openclaw') return

  if (entry.quitCommand) {
    try { injectIntoTab(tab, entry.quitCommand) } catch { /* Ctrl+C fallback below */ }
    sleep(500)
  }
  try { sendRawKey(tab, 3) } catch { /* best effort */ }
  sleep(700)

  if (entry.processMatchers?.length) {
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      sleep(200)
      if (!agentRunningInDir(agentId, dir)) return
    }
  }
}

function switchAgent(tab: string, dir: string, toAgent: AgentOption, fromAgent?: string, model?: string): void {
  const running = resolveRunningAgentsInDir(dir)
  const outgoing = resolveOutgoingAgentForDir(dir, fromAgent)
  const agentsToQuit = running.length
    ? running.filter((id) => id !== toAgent)
    : outgoing && outgoing !== toAgent
    ? [outgoing]
    : []

  for (const agentId of agentsToQuit) {
    quitAgentInTab(tab, agentId, dir)
  }

  if (agentsToQuit.length === 0 && fromAgent && isAgentId(fromAgent) && fromAgent !== toAgent) {
    quitAgentInTab(tab, fromAgent, dir)
  }

  clearHandoffSentinel(tab)
  launchAgentInTab(tab, dir, toAgent, model)
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
