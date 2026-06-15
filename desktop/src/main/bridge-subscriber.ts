/**
 * Bridge SSE subscriber for the desktop main process.
 *
 * Opens a long-lived connection to the FleetCrown event bridge (Hetzner-hosted
 * Postgres LISTEN → SSE fanout) and watches for pending_commands INSERT
 * events. When one fires for our user, we wake the long-poll loop via the
 * supplied callback so the queued command drains in <500ms instead of waiting
 * up to 25s for the next long-poll tick to return.
 *
 * Why this exists alongside the long-poller in poller.ts:
 *   - SSE is the fast path. p50 latency target <500ms.
 *   - Long-poll is the safety net. If the bridge drops events, network blips,
 *     or the user is on an older daemon, the long-poll still drains the queue
 *     within 25s. Belt-and-braces by design.
 *   - We do NOT receive command bodies via SSE — only "table=pending_commands
 *     op=INSERT k=<id>" notifications. The body comes from the existing
 *     /api/control/commands long-poll endpoint, which already has the
 *     atomic claim semantics (FOR UPDATE SKIP LOCKED). Reusing that endpoint
 *     means we don't have two execution paths to keep in sync.
 *
 * Bridge wire format (defined in bridge/src/server.ts):
 *   event: hello \n data: {userId, serverTime} \n\n      — sent on connect
 *   event: change \n data: <ChangeEvent json> \n id: 42 \n\n  — per row change
 *   : ping <ms> \n\n                                       — heartbeat comment
 *
 * Reconnect strategy:
 *   - On disconnect: exponential backoff starting at 1s, capped at 30s
 *   - On successful connect: reset backoff to 1s
 *   - Last-Event-ID header sent on reconnect so the bridge replays events we
 *     missed during the gap (bridge buffers 1000 events; gap larger than that
 *     is rare and would require a manual reload anyway — but the long-poll
 *     safety net catches it regardless).
 */

import { request as httpsRequest } from 'https'
import { request as httpRequest } from 'http'
import { URL } from 'url'
import { BRIDGE_URL } from '@/config/brand'
import {
  isKnownTable,
  TABLE_PENDING_COMMANDS,
  type ChangeEvent,
} from '@/lib/event-stream-types'

/** Public hook callbacks. Kept narrow — the subscriber's job is detection,
 *  not action. The poller decides what to do when it gets the signal. */
export interface BridgeSubscriberCallbacks {
  /** Called when a pending_commands INSERT event arrives for our user.
   *  The poller's job is to immediately drain the queue. */
  onCommandPending: (commandId: string) => void
  /** Optional: called whenever the connection state changes, for status UI. */
  onStateChange?: (state: BridgeSubscriberState) => void
}

export type BridgeSubscriberState =
  | { mode: 'idle' }
  | { mode: 'connecting' }
  | { mode: 'connected' }
  | { mode: 'reconnecting'; backoffMs: number; lastError: string | null }
  | { mode: 'disabled'; reason: string }

interface Handle {
  stop: () => void
}

// Resolve the bridge URL: env override (for local dev pointing at a localhost
// bridge) → BRIDGE_URL constant from brand.ts (production). Same precedence
// the web client uses; see src/lib/event-stream.ts.
function resolveBridgeUrl(): string {
  const override = (process.env.FLEETCROWN_BRIDGE_URL ?? '').trim()
  return override.length > 0 ? override : BRIDGE_URL
}

/**
 * Start an SSE subscription. Idempotent semantics live in the caller (the
 * poller). The returned `stop` aborts the current request and prevents any
 * pending reconnect from firing.
 */
export function startBridgeSubscriber(
  token: string,
  callbacks: BridgeSubscriberCallbacks,
): Handle {
  let aborted = false
  let currentReq: ReturnType<typeof httpsRequest> | null = null
  let reconnectTimer: NodeJS.Timeout | null = null
  let backoffMs = 1_000
  let lastEventId = 0

  const url = resolveBridgeUrl()
  const baseUrl = new URL(url)
  const isHttps = baseUrl.protocol === 'https:'
  const requestFn = isHttps ? httpsRequest : httpRequest

  function setState(state: BridgeSubscriberState) {
    callbacks.onStateChange?.(state)
  }

  function scheduleReconnect(error: string | null) {
    if (aborted) return
    setState({ mode: 'reconnecting', backoffMs, lastError: error })
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      backoffMs = Math.min(backoffMs * 2, 30_000)
      connect()
    }, backoffMs)
  }

  function connect() {
    if (aborted) return
    setState({ mode: 'connecting' })

    // Token rides as a query param: EventSource (browser) can't set headers,
    // and the bridge auth flow is symmetric across browser + desktop for the
    // same reason. The cleartext-in-URL concern is bounded — TLS hides it
    // from the network, server logs are within our trust boundary.
    const sseUrl = new URL(baseUrl)
    sseUrl.searchParams.set('token', token)
    // Tag this as the runner connection so the bridge counts it toward
    // connection-based presence ("Fleet Runner online"). Browser /control tabs
    // open the same bridge without this flag and must NOT flip the badge.
    // See docs/architecture/connection-presence.md.
    sseUrl.searchParams.set('client', 'runner')

    const req = requestFn(
      {
        method: 'GET',
        hostname: sseUrl.hostname,
        port: sseUrl.port || (isHttps ? 443 : 80),
        path: `${sseUrl.pathname}${sseUrl.search}`,
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          // Replay buffered events we missed during a prior disconnect.
          // The bridge keeps a 1000-event ring buffer.
          ...(lastEventId > 0 ? { 'Last-Event-ID': String(lastEventId) } : {}),
        },
      },
      (res) => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          // Token rejected — no point reconnecting. The user must mint a new
          // one. The long-poller will hit the same wall and surface the error
          // via its own status path.
          setState({
            mode: 'disabled',
            reason: `Bridge rejected token (HTTP ${res.statusCode}). Mint a new one in Settings → Agent tokens.`,
          })
          aborted = true
          res.resume()
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          scheduleReconnect(`HTTP ${res.statusCode}`)
          return
        }

        setState({ mode: 'connected' })
        backoffMs = 1_000 // successful connect — reset backoff

        let buffer = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          buffer += chunk
          // SSE frames are delimited by \n\n. Split, parse each complete
          // frame, keep the last partial in the buffer for the next chunk.
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const frame of parts) {
            handleFrame(frame)
          }
        })
        res.on('end', () => {
          scheduleReconnect('connection closed by server')
        })
        res.on('error', (err) => {
          scheduleReconnect(err.message)
        })
      },
    )

    req.on('error', (err) => {
      scheduleReconnect(err.message)
    })

    req.end()
    currentReq = req
  }

  function handleFrame(frame: string) {
    let eventType = 'message'
    let data = ''
    for (const line of frame.split('\n')) {
      if (line.startsWith(':')) continue // comment / heartbeat
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        data += (data ? '\n' : '') + line.slice(5).trim()
      } else if (line.startsWith('id:')) {
        const parsed = parseInt(line.slice(3).trim(), 10)
        if (Number.isFinite(parsed)) lastEventId = parsed
      }
    }
    if (eventType !== 'change' || !data) return

    let event: ChangeEvent
    try {
      event = JSON.parse(data) as ChangeEvent
    } catch {
      return
    }
    if (!isKnownTable(event.t)) return
    if (event.t === TABLE_PENDING_COMMANDS && event.op === 'INSERT') {
      try {
        callbacks.onCommandPending(event.k)
      } catch {
        // Callback errors must not break the stream. The poller has its own
        // error handling; we just deliver.
      }
    }
  }

  connect()

  return {
    stop: () => {
      aborted = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (currentReq && !currentReq.destroyed) {
        currentReq.destroy()
      }
      currentReq = null
      setState({ mode: 'idle' })
    },
  }
}
