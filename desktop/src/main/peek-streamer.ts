// Live-terminal frame streamer (runner side) — dual mode.
//
// On peek_start the runner streams a tab to the cloud (/api/control/peek-frame
// → SSE viewer); on peek_stop it tears down. Streaming runs only while a viewer
// is watching (the cloud ref-counts viewers), so an unwatched fleet costs nothing.
//
//   • PTY-backed tab (FleetCrown owns the agent's PTY): a TRUE byte stream. We
//     subscribe to the executor's output and POST each delta with append=true;
//     the viewer xterm.write()s it. Full fidelity, real colors, scrollback, no
//     focus-dance. This is the destination the comment below used to call "the
//     deferred WebSocket path".
//   • zellij tab (legacy): no PTY handle, so we poll dump-screen (a full screen
//     snapshot) at POLL_MS and POST changed frames (append=false → viewer
//     resets+writes). Each dump-screen does a brief focus-dance, so the rate is
//     deliberately modest. See docs/architecture/embedded-terminal.md.

import { createHash } from 'node:crypto'
import { peekTab as peekZellijTab } from '@/lib/zellij'
import { executor } from '@/lib/agent-execution'
import { isPtyBacked, runnerWorkspaceId } from './pty-runtime'

const POLL_MS = 1000         // zellij snapshot rate — focus-dance once/sec
const MAX_FRAME = 256_000    // matches the cloud route's cap

type Stream = { stop: () => void }
const streams = new Map<string, Stream>()

const key = (tab: string) => tab.toLowerCase()

async function postFrame(
  base: string,
  token: string,
  tab: string,
  seq: number,
  frame: string,
  append: boolean,
): Promise<void> {
  await fetch(`${base}/api/control/peek-frame`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tab, seq, frame, append }),
  }).then((r) => { if (!r.ok) console.log(`[peek] ${tab}: frame POST → ${r.status}`) })
    .catch((e) => { console.log(`[peek] ${tab}: frame POST error ${(e as Error).message}`) })
}

export function startPeek(base: string, token: string, tab: string): void {
  if (streams.has(key(tab))) { console.log(`[peek] ${tab}: already streaming`); return }
  const pty = isPtyBacked(tab)
  console.log(`[peek] start ${tab}: ${pty ? 'PTY' : 'zellij'} (wsid=${runnerWorkspaceId(tab)})`)
  // DIAGNOSTIC (v0.8.4): surface the chosen branch as a visible frame so it can
  // be read from the browser viewer without terminal access. Append-mode so it
  // shows in either path; the PTY initial frame (or zellij snapshot) follows.
  void postFrame(base, token, tab, 0, `\r\n[peek-debug] tab=${tab} → ${pty ? 'PTY (owned)' : 'ZELLIJ (no owned PTY found)'} \r\n`, true)
  if (pty) startPtyStream(base, token, tab)
  else startZellijStream(base, token, tab)
}

/** True byte stream from the owned PTY. Replays the retained buffer as one
 *  initial frame (so the viewer sees current state), then streams live deltas. */
function startPtyStream(base: string, token: string, tab: string): void {
  const id = runnerWorkspaceId(tab)
  let seq = 0
  // Serialize POSTs so byte deltas arrive in generation order — out-of-order
  // appends would corrupt the viewer's terminal. Each frame chains on the prev.
  let chain: Promise<void> = Promise.resolve()
  const enqueue = (frame: string, append: boolean): void => {
    const n = seq++
    chain = chain.then(() => postFrame(base, token, tab, n, frame, append))
  }
  // executor.subscribe replays the buffer synchronously first; coalesce that
  // into ONE initial frame (keep the tail if it exceeds the cap), then stream
  // live output deltas individually.
  let initial = ''
  let replaying = true
  const unsub = executor.subscribe(id, 0, (e) => {
    if (e.kind !== 'output' || !e.data) return
    if (replaying) { initial += e.data; return }
    enqueue(e.data, true)
  })
  replaying = false
  console.log(`[peek] ${tab}: PTY initial buffer = ${initial.length} bytes`)
  // DIAGNOSTIC (v0.8.4): visible buffer size so a blank view can be told apart
  // from "agent produced no output yet".
  enqueue(`[peek-debug] PTY initial buffer = ${initial.length} bytes\r\n`, true)
  if (initial) enqueue(initial.length > MAX_FRAME ? initial.slice(initial.length - MAX_FRAME) : initial, true)
  streams.set(key(tab), { stop: unsub })
}

/** Legacy zellij snapshot poll — full dump-screen frames, dedup by hash. */
function startZellijStream(base: string, token: string, tab: string): void {
  let seq = 0
  let lastHash = ''
  let inFlight = false
  const tick = async (): Promise<void> => {
    if (inFlight) return // don't pile up if the network or dump-screen is slow
    let frame: string
    try { frame = peekZellijTab(tab) } catch { return } // tab gone / zellij busy
    if (frame.length > MAX_FRAME) frame = frame.slice(0, MAX_FRAME)
    const hash = createHash('sha1').update(frame).digest('hex')
    if (hash === lastHash) return // unchanged — don't send
    lastHash = hash
    inFlight = true
    try { await postFrame(base, token, tab, seq++, frame, false) } finally { inFlight = false }
  }
  const timer = setInterval(tick, POLL_MS)
  streams.set(key(tab), { stop: () => clearInterval(timer) })
  void tick() // fire one immediately so the viewer sees the screen without waiting
}

export function stopPeek(tab: string): void {
  const s = streams.get(key(tab))
  if (!s) return
  s.stop()
  streams.delete(key(tab))
}

/** Clear every stream — called on app shutdown / token loss. */
export function stopAllPeek(): void {
  for (const s of streams.values()) s.stop()
  streams.clear()
}
