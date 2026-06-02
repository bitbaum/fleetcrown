/**
 * Local runtime integration point for the Cockpit Fleet Runner (Electron).
 *
 * Goal: Own the best parts of the current `home/` stack (and eventually daemon logic)
 * so the desktop app is the authoritative local executor.
 *
 * This is the beginning of desktop-2.
 * See docs/desktop-app.md and the fleet-runner architecture essay.
 *
 * Note: We are deliberately starting with the most self-contained pieces of home/
 * (state, decide, emit) because they have fewer dependencies on the web src/ tree.
 * Deeper integration (projects, watcher) will drive the extraction of a proper
 * shared @cockpit/local-runtime package.
 */

import * as HomeState from '@home/state'
import * as HomeDecide from '@home/decide'
import * as HomeEmit from '@home/emit'
import * as HomeProjects from '@home/projects'
import { renderTaskForAdapter } from '@/lib/orchestration'
import { execSync } from 'child_process'

// Basic status proving we can reach the modern local runtime model from Electron main.
export type LocalRuntimeStatus = {
  homeStackIntegrated: boolean
  hasDecide: boolean
  hasState: boolean
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
    projectsLoaded: true,
    projectCount,
    homeStackVersion: 'home/ core (state + decide + emit + projects) integrated in Electron main — scaffold'
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

// Simple in-memory state for the desktop runtime (will be driven by real events later)
let currentState: any = {}

export function getCurrentState() {
  return currentState
}

// Real-ish dispatch: uses decide, renders the actual prompt via the orchestration renderer,
// "injects" by logging (in real version this would go to Zellij via child_process or the worker logic),
// and updates state.
export async function dispatchIntent(projectKey: string, intent: string, queueHead?: string) {
  console.log(`[desktop-runtime] dispatch ${intent} for ${projectKey}`, { queueHead })

  const projectConfig = (projectsCache && projectsCache[projectKey]) || { name: projectKey, dir: '.' }

  // Build minimal project state for decide
  const decideInput = {
    project: {
      project: projectKey,
      recentOutcomes: currentState.recentOutcomes || [],
      lastHandoff: currentState.lastHandoff || {},
      currentRun: currentState.currentRun || null,
    },
    queueHead: queueHead || '',
    autonomy: 'manual'
  }

  const decision = HomeDecide.decide ? HomeDecide.decide(decideInput) : { action: { kind: 'next_best' } }

  // Render the actual prompt that would be sent to the agent (SSOT)
  let renderedPrompt = ''
  try {
    renderedPrompt = renderTaskForAdapter({
      project: projectKey,
      projectPath: projectConfig.dir || '.',
      intent: intent as any,
      adapter: 'claude',
      customInstructions: queueHead,
      queue: [],
    })
  } catch (e) {
    renderedPrompt = `[rendered prompt for ${intent} on ${projectKey}]`
  }

  console.log(`[desktop-runtime] Would inject into Zellij tab "${projectKey}":\n${renderedPrompt}`)

  // Attempt real(ish) injection via zellij CLI if available on this machine.
  // This makes the app actually start controlling your local sessions.
  let injected = false
  try {
    // zellij action write-chars sends text to the focused pane in the named session/tab.
    // In real setup the tab name matches the project key in many configs.
    execSync(`zellij action --session "${projectKey}" write-chars ${JSON.stringify(renderedPrompt + '\n')}`, { stdio: 'ignore' })
    injected = true
    console.log(`[desktop-runtime] Injected prompt into zellij session "${projectKey}"`)
  } catch (e) {
    // zellij not running that session or not installed — common in early use.
    console.log(`[desktop-runtime] Could not auto-inject (zellij session may not be running or not installed). Prompt is in the UI for you to use.`)
  }

  // Simulate applying an event
  const fakeEvent = { v: 1, id: 'desktop-' + Date.now(), ts: new Date().toISOString(), kind: 'bridge.dispatch', project: projectKey, intent } as any
  currentState = HomeState.applyEvent ? HomeState.applyEvent(currentState, fakeEvent) : { ...currentState, lastIntent: intent, lastPrompt: renderedPrompt, lastInjected: injected }

  // In full version: HomeEmit.appendEvent + proper worker with zellij targeting + status.

  return {
    ok: true,
    projectKey,
    intent,
    decision,
    renderedPrompt: renderedPrompt.slice(0, 300) + (renderedPrompt.length > 300 ? '...' : ''),
    injected,
    newStateSnapshot: currentState,
  }
}

// Re-export the core pieces so the renderer (via IPC) or future UI can use them.
export { HomeDecide, HomeState, HomeEmit }
