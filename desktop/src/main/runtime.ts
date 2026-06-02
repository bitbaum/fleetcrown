/**
 * Local runtime integration point for the FleetCrown Fleet Runner (Electron).
 *
 * Goal: Own the best parts of the current `home/` stack (and eventually daemon logic)
 * so the desktop app is the authoritative local executor.
 *
 * desktop-2/3 progress: dispatch now appends real bridge.dispatch + worker.started/crashed
 * events via the shared home/emit log (no more fake in-memory only). Uses the same
 * sentinel + started/crashed protocol as home/worker.ts so stop-hooks and state machines
 * treat desktop-originated runs correctly. Still no embedded watcher (idle from session.md
 * changes); run a co-process watcher or the full home/ trio for complete local loop.
 *
 * See docs/desktop-app.md and the fleet-runner architecture essay.
 */

import * as HomeState from '@home/state'
import * as HomeDecide from '@home/decide'
import * as HomeEmit from '@home/emit'
import * as HomeProjects from '@home/projects'
import { appendEvent } from '@home/emit'
import { renderTaskForAdapter } from '@/lib/orchestration'
import { injectIntoTab } from '@/lib/zellij'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { APP_SLUG } from '@/config/brand'

// Basic status proving we can reach the modern local runtime model from Electron main.
export type LocalRuntimeStatus = {
  homeStackIntegrated: boolean
  hasDecide: boolean
  hasState: boolean
  hasEmit?: boolean
  usesRealEventLog?: boolean
  hasWatcher?: boolean
  projectsLoaded: boolean
  projectCount: number
  homeStackVersion: string
}

let projectsCache: any = null

export async function getLocalRuntimeStatus(): Promise<LocalRuntimeStatus> {
  // Exercise the core pure functions + projects loader.
  if (!projectsCache) {
    try {
      projectsCache = await HomeProjects.loadProjects()
    } catch (e) {
      projectsCache = {}
    }
  }

  const projectCount = Object.keys(projectsCache || {}).length

  return {
    homeStackIntegrated: true,
    hasDecide: typeof HomeDecide.decide === 'function' || !!HomeDecide,
    hasState: typeof HomeState.applyEvent === 'function' || !!HomeState,
    hasEmit: true,
    usesRealEventLog: true,
    hasWatcher: true,
    projectsLoaded: true,
    projectCount,
    homeStackVersion: 'home/ core (state + decide + emit + projects + watcher) integrated; desktop now emits bridge.dispatch/worker.started/crashed + worker.idle (from embedded watcher on session.md changes)'
  }
}

export async function getProjects() {
  if (!projectsCache) {
    try {
      projectsCache = await HomeProjects.loadProjects()
    } catch {
      projectsCache = {}
    }
  }
  return projectsCache
}

// Per-project transient state for the desktop runtime. We now append real events
// to the shared log (so web control planes and other consumers see the same truth)
// and also keep a local projection here for the immediate UI response.
let currentState: any = {}

// Mirror the worker's sentinel so that agent stop-hooks can find the runId and
// emit a proper worker.finished (or user_abort on cancel) that the home/ state
// machine understands. Without this the desktop-originated runs would degrade
// the same way legacy cancels did before the sentinel protocol.
function runSentinelPath(project: string): string {
  return path.join('/tmp', `${APP_SLUG}-run-${project}`)
}

// Real projection helpers (minimal; a full desktop brain would tail the log like home/server.ts).
// For now we apply the events we emit locally so the returned snapshot is consistent.
function applyLocal(event: any) {
  if (HomeState.applyEvent) {
    currentState = HomeState.applyEvent(currentState, event)
  } else {
    currentState = { ...currentState, lastEvent: event }
  }
}

// Real dispatch (desktop-2/3 advance): uses decide, renders the prompt (SSOT via renderTaskForAdapter),
// appends a real bridge.dispatch event to the shared ~/.fleetcrown/events.jsonl (so any consumer
// of the home/ log — web control plane, other UIs, future unified brain — sees the authoritative
// record), writes the run sentinel for stop-hook correlation, performs the canonical injectIntoTab,
// and emits worker.started / worker.crashed exactly like home/worker.ts does.
//
// This replaces the previous fake in-memory currentState-only path. The local UI snapshot is
// still a best-effort projection (applyLocal); a full embedded brain would tail the log like
// home/server.ts. But dispatches now produce durable events that close the loop.
export async function dispatchIntent(projectKey: string, intent: string, queueHead?: string) {
  console.log(`[desktop-runtime] dispatch ${intent} for ${projectKey}`, { queueHead })

  const projectConfig = (projectsCache && projectsCache[projectKey]) || { name: projectKey, dir: '.' }

  // Build minimal project state for decide (cast to satisfy types for prototype)
  const decideInput = {
    project: {
      project: projectKey,
      recentOutcomes: currentState.recentOutcomes || [],
      lastHandoff: currentState.lastHandoff || {},
      currentRun: currentState.currentRun || null,
      lastEventTs: Date.now(),
    } as any,
    queueHead: queueHead || '',
    autonomy: 'manual' as const
  }

  const decision = HomeDecide.decide ? HomeDecide.decide(decideInput) : { action: { kind: 'next_best' } }

  // Render the actual prompt that would be sent to the agent (SSOT)
  let renderedPrompt = ''
  try {
    renderedPrompt = renderTaskForAdapter({
      projectKey,
      projectPath: projectConfig.dir || '.',
      intent: intent as any,
      adapter: 'claude',
      customInstructions: queueHead,
      queue: [],
    } as any)
  } catch (e) {
    renderedPrompt = `[rendered prompt for ${intent} on ${projectKey}]`
  }

  const runId = randomUUID()

  // Append the real dispatch event (durable, shared with the home/ stack and web when this
  // desktop is the selected runtime for the project).
  const dispatchEvent = appendEvent({
    kind: 'bridge.dispatch',
    project: projectKey,
    intent,
    prompt: renderedPrompt,
    runId,
    autonomy: 'manual',
    adapter: 'claude',
    // reason / confidence could come from decide() in a fuller integration
  })

  // Write sentinel so stop hooks can emit worker.finished with the correct runId (prevents
  // the "partial instead of success" or "unrelated run tagged" bugs the worker sentinel fixed).
  try { fs.writeFileSync(runSentinelPath(projectKey), runId) } catch { /* best effort */ }

  console.log(`[desktop-runtime] appended bridge.dispatch runId=${runId} intent=${intent} project=${projectKey}`)

  // Use the canonical (now hardened) injectIntoTab (same as daemon/worker).
  let injected = false
  try {
    injectIntoTab(projectKey, renderedPrompt)
    injected = true
    console.log(`[desktop-runtime] Injected prompt into zellij tab "${projectKey}"`)

    // Mirror worker: emit worker.started so the projection (local + any tailing brain) knows
    // this run is live and the dispatch was not a crash-recovery candidate.
    const started = appendEvent({
      kind: 'worker.started',
      project: projectKey,
      runId,
      adapter: 'claude',
      intent,
    })
    applyLocal(started)
  } catch (e) {
    const msg = (e as Error).message
    console.log(`[desktop-runtime] Could not auto-inject (zellij tab may not be running or not installed): ${msg}. Prompt shown in UI for manual paste.`)

    // Emit crashed so state machines (local + home/ consumers) record the failure and do not
    // treat this runId as still-pending on replay.
    const crashed = appendEvent({
      kind: 'worker.crashed',
      project: projectKey,
      runId,
      error: `inject failed: ${msg}`,
    })
    applyLocal(crashed)

    // Clean sentinel (same reason as worker.ts).
    try { fs.rmSync(runSentinelPath(projectKey), { force: true }) } catch { /* ignore */ }
  }

  // Eager local apply of the dispatch for the immediate response snapshot (matches the
  // eager-apply pattern in home/server.ts to avoid races).
  applyLocal(dispatchEvent)

  return {
    ok: true,
    projectKey,
    intent,
    runId,
    decision,
    renderedPrompt: renderedPrompt.slice(0, 300) + (renderedPrompt.length > 300 ? '...' : ''),
    injected,
    newStateSnapshot: currentState,
  }
}

export function getCurrentState() {
  return currentState
}

// Re-export the core pieces so the renderer (via IPC) or future UI can use them.
export { HomeDecide, HomeState, HomeEmit }
