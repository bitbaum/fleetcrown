// Run progress heartbeat — see src/lib/run-progress.ts for the contract.
//
// After a dispatch's prompt verifiably landed, this subscribes to the tab's
// owned PTY (same in-memory stream the peek streamer uses; pure, no I/O) and
// reports "still printing" to the cloud at most every RUN_PROGRESS_BEAT_MS.
// The cloud stamps payload.lastProgressAt on the run and appends a `progress`
// event, which is what turns Feedback's "Queued" into "Working · 12 min" and
// lets it call a silent agent stalled instead of guessing.
import { executor } from '@/lib/agent-execution'
import { runnerWorkspaceId } from './pty-runtime'
import { detectAuthFailure } from './agent-auth'
import {
  RUN_BLOCKED,
  RUN_PROGRESS_BEAT_MS,
  shouldBeat,
  shouldDiagnoseSilence,
  type RunBlocked,
  type RunProgressBeat,
} from '@/lib/run-progress'

type Track = {
  runId: string
  tab: string
  bytesSinceBeat: number
  lastOutputAt: number
  lastBeatAt: number
  startedAt: number
  unsub: () => void
  timer: ReturnType<typeof setInterval>
  /** The workspace dir, so a silent agent can be asked WHY it is silent. */
  dir: string
  blocked: RunBlocked | null
}

const tracks = new Map<string, Track>()

export function startRunProgress(
  base: string,
  token: string,
  runId: string,
  tab: string,
  dir: string,
): void {
  stopRunProgress(runId)
  // One agent per tab: a newer run on the same tab supersedes the old track,
  // otherwise the old run would keep looking alive on the new run's output.
  for (const t of tracks.values()) if (t.tab === tab) stopRunProgress(t.runId)
  const now = Date.now()
  const track: Track = {
    runId,
    tab,
    bytesSinceBeat: 0,
    lastOutputAt: now,
    lastBeatAt: now,
    startedAt: now,
    unsub: () => {},
    dir,
    blocked: null,
    timer: setInterval(() => void tick(base, token, runId), Math.min(RUN_PROGRESS_BEAT_MS, 15_000)),
  }
  // subscribe replays the retained buffer synchronously; skip it — the replay
  // is history, not progress.
  let replaying = true
  track.unsub = executor.subscribe(runnerWorkspaceId(tab), 0, (e) => {
    if (replaying) return
    if (e.kind === 'exit') { stopRunProgress(runId); return }
    if (e.kind !== 'output' || !e.data) return
    track.bytesSinceBeat += e.data.length
    track.lastOutputAt = Date.now()
  })
  replaying = false
  tracks.set(runId, track)
}

export function stopRunProgress(runId: string): void {
  const t = tracks.get(runId)
  if (!t) return
  clearInterval(t.timer)
  t.unsub()
  tracks.delete(runId)
}

async function tick(base: string, token: string, runId: string): Promise<void> {
  const t = tracks.get(runId)
  if (!t) return
  // Silence has two meanings and the operator can only act on one. Before
  // deciding whether to beat, work out whether this quiet agent is thinking or
  // waiting for a human — the runner is the only thing that can tell.
  if (shouldDiagnoseSilence(t)) {
    t.blocked = detectAuthFailure(t.dir) ? RUN_BLOCKED.AUTH : null
  } else if (t.bytesSinceBeat > 0) {
    t.blocked = null
  }
  const decision = shouldBeat(t)
  if (decision === 'stop') { stopRunProgress(runId); return }
  if (decision === 'wait') return
  const beat: RunProgressBeat = {
    outputBytes: t.bytesSinceBeat,
    lastOutputAt: new Date(t.lastOutputAt).toISOString(),
    blocked: t.blocked,
  }
  t.bytesSinceBeat = 0
  t.lastBeatAt = Date.now()
  try {
    const res = await fetch(`${base}/api/control/runs/${runId}/progress`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(beat),
      signal: AbortSignal.timeout(5000),
    })
    // The cloud answers live:false once the run is closed — nothing left to
    // report on. A 404 means the same (run pruned).
    if (res.status === 404) { stopRunProgress(runId); return }
    const body = (await res.json().catch(() => null)) as { live?: boolean } | null
    if (body && body.live === false) stopRunProgress(runId)
  } catch (e) {
    // Telemetry: the next tick retries; bytes since then are counted again.
    console.warn('[run-progress] beat failed:', (e as Error).message)
  }
}
