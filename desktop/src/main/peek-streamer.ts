// Live-terminal frame streamer (runner side).
//
// On peek_start the runner polls `dump-screen` for a tab at POLL_MS and POSTs
// each CHANGED frame to /api/control/peek-frame; the cloud fans it to the SSE
// viewer. On peek_stop the loop is cleared. Streaming runs only while a viewer
// is watching (the cloud ref-counts viewers and sends start/stop), so an
// unwatched fleet costs nothing.
//
// zellij has no PTY stream — dump-screen (a full screen snapshot) is the only
// clean handle, so this is screen-state streaming, not a byte stream.
//
// IMPORTANT zellij limitation: there is no "read a non-focused pane" primitive,
// so every dump-screen does a brief focus-dance (switch to the tab, dump,
// restore). That means each frame momentarily flips the user's local zellij
// focus. Fine when watching from a phone (user is away from the machine);
// noticeable when working at the machine. So the rate is deliberately modest —
// this is "smart frequent snapshots", not flicker-free streaming. True live
// (no focus flash, real colors, interactive) needs a PTY stream, which is the
// deferred WebSocket path. See docs/architecture/embedded-terminal.md.

import { createHash } from 'node:crypto'
import { peekTab as peekZellijTab } from '@/lib/zellij'

const POLL_MS = 1000         // 1 Hz — focus-dance once/sec; higher feels live but flashes the user's terminal
const MAX_FRAME = 256_000    // matches the cloud route's cap

type Stream = { timer: NodeJS.Timeout; seq: number; lastHash: string; inFlight: boolean }
const streams = new Map<string, Stream>()

const key = (tab: string) => tab.toLowerCase()

async function postFrame(base: string, token: string, tab: string, seq: number, frame: string): Promise<void> {
  await fetch(`${base}/api/control/peek-frame`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tab, seq, frame }),
  }).catch(() => { /* transient — next tick retries with the latest frame */ })
}

export function startPeek(base: string, token: string, tab: string): void {
  if (streams.has(key(tab))) return // already streaming this tab
  const s: Stream = { timer: setInterval(tick, POLL_MS), seq: 0, lastHash: '', inFlight: false }
  streams.set(key(tab), s)

  async function tick(): Promise<void> {
    if (s.inFlight) return // don't pile up if the network or dump-screen is slow
    let frame: string
    try { frame = peekZellijTab(tab) } catch { return } // tab gone / zellij busy — skip this tick
    if (frame.length > MAX_FRAME) frame = frame.slice(0, MAX_FRAME)
    const hash = createHash('sha1').update(frame).digest('hex')
    if (hash === s.lastHash) return // unchanged — don't send
    s.lastHash = hash
    s.inFlight = true
    try { await postFrame(base, token, tab, s.seq++, frame) } finally { s.inFlight = false }
  }
  // Fire one immediately so the viewer sees the current screen without waiting.
  void tick()
}

export function stopPeek(tab: string): void {
  const s = streams.get(key(tab))
  if (!s) return
  clearInterval(s.timer)
  streams.delete(key(tab))
}

/** Clear every stream — called on app shutdown / token loss. */
export function stopAllPeek(): void {
  for (const s of streams.values()) clearInterval(s.timer)
  streams.clear()
}
