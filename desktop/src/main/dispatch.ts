/**
 * Fleet Runner autopilot dispatch.
 *
 * Replaces the bash Stop hook (~/.local/share/fleetcrown-beacon/agent-hook-
 * bridge.sh:autopilot_dispatch_and_inject) that was retired in Session 1
 * of the killing-the-bash-daemon migration (see /home/g/.claude/plans/
 * structured-baking-kazoo.md and content/thoughts/killing-the-bash-daemon.md).
 *
 * Trigger path now:
 *   home/watcher.ts detects ~/.fleetcrown/sessions/<P>.md changing to status:ready
 *     → desktop/src/main/index.ts notifyOnIdle() fires
 *     → dispatchAutopilot() here POSTs /api/control/dispatch
 *     → cloud writes a pending_command (action=queue or action=nextbest)
 *     → desktop/src/main/poller.ts picks it up and types into zellij
 *
 * Design choices mirroring the bash bridge's hardened behavior:
 *
 *  1. Per-project cooldown — defaults to 300s. The bash bridge added this on
 *     2026-05-31 after a "ready→fire→ready→fire" tight loop was observed on
 *     the revamp-it tab. The status gate alone doesn't break the loop because
 *     the AGENT writes status:ready each iteration. Cooldown enforces an
 *     absolute floor on auto-fire interval, regardless of how often the
 *     handoff is rewritten. Manual /control dispatch is NOT gated by this —
 *     only the auto-fire path.
 *
 *  2. Status gate — only fire when handoff.status === 'ready'. 'working' or
 *     'blocked' means the agent told us "don't fire."
 *
 *  3. Cloud is authoritative on mode — we don't read auto_inject_mode here.
 *     We POST always and let dispatch-gates.ts return {action:'off'} when the
 *     user is in off mode. Matches the bash bridge's behavior; one place to
 *     change mode logic, not two.
 *
 *  4. Retry with exponential backoff — 3 attempts, 0/1000/4000 ms. Transient
 *     5xx and network errors retry; 401/403 short-circuit (token rotation
 *     belongs to the pusher, not here).
 *
 *  5. Offline tolerance — failure to dispatch is non-fatal. The next
 *     status:ready transition will try again. No queue-on-failure because
 *     the trigger is the session file write itself, which is durable.
 *
 * Logs go to stdout (visible in Fleet Runner's renderer console + the
 * Electron main log). Future: pipe to home/log.ts JSONL so the activity
 * stream can render autopilot decisions alongside agent events.
 */

import { loadToken } from './token-store'
import type { Handoff } from '@/lib/events'
import { APP_URL } from '@/config/brand'

const BASE_URL = (process.env.FLEETCROWN_WEB_URL || '').trim() || APP_URL
const COOLDOWN_MS = Number(process.env.FLEETCROWN_AUTOPILOT_COOLDOWN_S || 300) * 1000
const MAX_ATTEMPTS = 3
const BACKOFF_MS = [0, 1000, 4000]
const QUEUE_FETCH_TIMEOUT_MS = 4000
const DISPATCH_TIMEOUT_MS = 18000

const lastFireByProject = new Map<string, number>()

export type DispatchOutcome = {
  skipped?: string
  action?: 'queue' | 'nextbest' | 'composed' | 'off' | string
  reason?: string
}

export async function dispatchAutopilot(opts: {
  project: string
  handoff: Handoff
}): Promise<DispatchOutcome> {
  const { project, handoff } = opts

  if (handoff.status !== 'ready') {
    return { skipped: `status=${handoff.status || 'empty'}` }
  }

  const now = Date.now()
  const last = lastFireByProject.get(project) ?? 0
  if (now - last < COOLDOWN_MS) {
    const ageS = Math.round((now - last) / 1000)
    const cdS = Math.round(COOLDOWN_MS / 1000)
    return { skipped: `cooldown ${ageS}s/${cdS}s` }
  }

  const token = loadToken()
  if (!token) {
    return { skipped: 'no token (run /control once to mint a Fleet Runner key)' }
  }

  const queue = await fetchQueue(project, token).catch(() => [] as string[])

  const payload = {
    handoff: {
      done:   handoff.done   ?? '',
      next:   handoff.next   ?? '',
      health: handoff.health ?? '',
      tests:  handoff.tests  ?? '',
      todos:  handoff.todos  ?? '',
      status: handoff.status,
    },
    blockerCount: 0,
    noOpCount: 0,
    queue,
    projectName: project,
    projectKey:  project,
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt])
    try {
      const resp = await fetch(`${BASE_URL}/api/control/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      })
      if (resp.status === 401 || resp.status === 403) {
        return { skipped: `auth ${resp.status} — token rejected; pusher will mint a new one on next /control load` }
      }
      if (!resp.ok) {
        if (attempt === MAX_ATTEMPTS - 1) return { skipped: `dispatch ${resp.status}` }
        continue
      }
      const body = await resp.json() as { action?: string; reason?: string }
      lastFireByProject.set(project, now)
      // dispatch is just the decision oracle — convert the verdict into the
      // actual inject. The cloud /api/inject endpoint queues a
      // pending_command, which Fleet Runner's own poller.ts then picks up
      // and types into the zellij tab. The bash bridge used to do this in
      // emit_or_inject_prompt; we do it inline here so the trigger and the
      // inject live in the same TS module.
      if (body.action === 'queue' && queue.length > 0) {
        await postInject({ tab: project, customPrompt: queue[0], token })
      } else if (body.action === 'nextbest') {
        await postInject({ tab: project, promptKey: 'next_best', token })
      }
      // action === "off" or unknown → no inject. The dispatch decision was
      // recorded in control_audit_events on the cloud side; nothing to do
      // locally.
      return { action: body.action as DispatchOutcome['action'], reason: body.reason }
    } catch (e) {
      const msg = (e as Error).message
      if (attempt === MAX_ATTEMPTS - 1) return { skipped: `network: ${msg}` }
    }
  }
  return { skipped: 'unreachable' }
}

async function postInject(opts: { tab: string; customPrompt?: string; promptKey?: string; token: string }): Promise<void> {
  try {
    const resp = await fetch(`${BASE_URL}/api/inject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify({
        tab: opts.tab,
        ...(opts.customPrompt ? { customPrompt: opts.customPrompt } : {}),
        ...(opts.promptKey ? { promptKey: opts.promptKey } : {}),
      }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    })
    if (!resp.ok) {
      console.warn(`[autopilot] inject POST returned ${resp.status} — pending_command may not have been created`)
    }
  } catch (e) {
    console.warn(`[autopilot] inject POST failed: ${(e as Error).message}`)
  }
}

async function fetchQueue(project: string, token: string): Promise<string[]> {
  const encoded = encodeURIComponent(project)
  const resp = await fetch(`${BASE_URL}/api/beacon/queue/${encoded}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(QUEUE_FETCH_TIMEOUT_MS),
  })
  if (!resp.ok) return []
  const body = await resp.json() as { queue?: string[] }
  return Array.isArray(body.queue) ? body.queue : []
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Reset the cooldown for a project — exposed for tests and for the future
 *  "user clicked manual dispatch" path that might want to bypass the cool
 *  window. Not currently called from anywhere in main process. */
export function resetCooldown(project: string): void {
  lastFireByProject.delete(project)
}
