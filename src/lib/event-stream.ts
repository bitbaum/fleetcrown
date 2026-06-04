// Client-side helpers for connecting to the FleetCrown event bridge.
//
// The bridge URL is configured via NEXT_PUBLIC_FLEETCROWN_BRIDGE_URL. When
// it's set, we open one EventSource per browser session and route incoming
// change events through a typed dispatch. When it's NOT set (local dev,
// preview deploys without the bridge), all the SSE-aware code degrades to
// the legacy polling path — no feature flag, no special cases. The hook
// just returns "I have no live stream" and existing 30-second polling
// keeps working.

import { useEffect, useMemo, useRef, useState } from "react";

/** Mirror of the bridge's ChangeEvent payload. */
export interface BridgeChangeEvent {
  /** Short table name — "project_states", "runtime_snapshots", etc. */
  t: string;
  /** Owning user UUID (the bridge already filtered to the connected user). */
  u: string;
  /** Row identifier — project_key, snapshot id, etc. */
  k: string;
  /** SQL op that fired the trigger. */
  op: "INSERT" | "UPDATE" | "DELETE";
  /** Unix seconds at NOTIFY emit time. */
  ts: number;
}

export type EventStreamState =
  | { mode: "disabled" } // no bridge URL configured — caller should keep polling
  | { mode: "connecting" }
  | { mode: "connected"; serverTime: number }
  | { mode: "reconnecting"; lastError: string | null }
  | { mode: "no-token" }; // user not signed in to a flow that exposes a ck_* token

/**
 * Open a long-lived SSE connection to the bridge for the duration of the
 * component's lifetime. Calls `onChange` for every relevant ChangeEvent.
 *
 * Returns the current connection state for the caller to show a small
 * indicator if it wants to ("live"/"reconnecting"/etc).
 *
 * The token is read from a fetch to /api/event-stream-token (a thin
 * server-side endpoint that picks the caller's most-recent agent token).
 * That keeps ck_* values out of client-side state and storage.
 */
export function useEventStream(opts: {
  /** Fired for every change event the bridge sends for this user. */
  onChange: (event: BridgeChangeEvent) => void;
  /** Whether to actually connect. Defaults to true; useful for pausing
   *  during things like sign-out flows. */
  enabled?: boolean;
}): EventStreamState {
  const { onChange, enabled = true } = opts;
  const [state, setState] = useState<EventStreamState>(() =>
    bridgeUrl() ? { mode: "connecting" } : { mode: "disabled" },
  );

  // Keep the latest onChange in a ref so we don't tear down the EventSource
  // every time the parent component re-renders with a new closure.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const url = bridgeUrl();
    if (!url || !enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing state with deps change (enabled toggle); not a render loop because nothing in the deps reads `state`
      setState({ mode: "disabled" });
      return;
    }
    // Pin the non-null value for the inner async closure — TS's narrow
    // doesn't reach into nested functions through closure capture.
    const sseBase: string = url;

    let es: EventSource | null = null;
    let cancelled = false;
    let lastEventId = 0;

    async function connect() {
      // Mint or look up an SSE-safe token via the server. The server
      // returns the plaintext ck_* exactly once per fresh mint; the
      // browser holds it in this closure for the lifetime of the
      // EventSource and discards it on tab close.
      let token: string | null = null;
      try {
        const resp = await fetch("/api/event-stream-token", { credentials: "include" });
        if (resp.ok) {
          const body = (await resp.json()) as { token?: string };
          token = body.token ?? null;
        }
      } catch {
        // If the token endpoint isn't deployed yet, fall through to no-token.
      }
      if (!token) {
        if (!cancelled) setState({ mode: "no-token" });
        return;
      }

      const sseUrl = new URL(sseBase);
      sseUrl.searchParams.set("token", token);
      // EventSource doesn't support setting Last-Event-ID via constructor;
      // it sets it automatically based on the most recent received `id:`
      // line. We track it manually too so that any error → reconnect cycle
      // can pick up from where we left off if EventSource forgets.
      if (lastEventId > 0) sseUrl.searchParams.set("last_event_id", String(lastEventId));

      es = new EventSource(sseUrl.toString(), { withCredentials: false });

      es.addEventListener("hello", (msg) => {
        if (cancelled) return;
        try {
          const body = JSON.parse((msg as MessageEvent).data) as { serverTime: number };
          setState({ mode: "connected", serverTime: body.serverTime });
        } catch {
          setState({ mode: "connected", serverTime: Date.now() });
        }
      });

      es.addEventListener("change", (msg) => {
        if (cancelled) return;
        const evt = msg as MessageEvent;
        if (evt.lastEventId) {
          const id = parseInt(evt.lastEventId, 10);
          if (Number.isFinite(id)) lastEventId = id;
        }
        try {
          const payload = JSON.parse(evt.data) as BridgeChangeEvent;
          onChangeRef.current(payload);
        } catch {
          // Malformed payload — silently skip. The bridge shouldn't emit
          // anything malformed, and a parse error here is not actionable
          // on the client side.
        }
      });

      es.onerror = () => {
        // EventSource auto-reconnects on its own. Just surface the state.
        if (cancelled) return;
        setState({ mode: "reconnecting", lastError: "stream interrupted" });
      };
    }

    void connect();

    return () => {
      cancelled = true;
      if (es) {
        es.close();
        es = null;
      }
    };
  }, [enabled]);

  return state;
}

/** Read NEXT_PUBLIC_FLEETCROWN_BRIDGE_URL on the client. Memoized via the
 *  module-level binding so we don't re-read process.env on every render. */
let cachedUrl: string | null | undefined;
function bridgeUrl(): string | null {
  if (cachedUrl !== undefined) return cachedUrl;
  const raw = (process.env.NEXT_PUBLIC_FLEETCROWN_BRIDGE_URL ?? "").trim();
  cachedUrl = raw.length > 0 ? raw : null;
  return cachedUrl;
}

/** Exported for the few components that want to render different UI when
 *  the bridge is configured (e.g., "Live updates: on" indicator). */
export function isBridgeConfigured(): boolean {
  return bridgeUrl() !== null;
}

/** Memoizable helper that filters which tables a caller cares about.
 *  Most components only care about a subset. Cheaper to filter once at
 *  the dispatch site than to do it inside every onChange handler. */
export function useFilteredChangeHandler(opts: {
  tables: string[];
  onChange: (event: BridgeChangeEvent) => void;
}) {
  const { tables, onChange } = opts;
  const tableSet = useMemo(() => new Set(tables), [tables]);
  return useMemo(
    () => (event: BridgeChangeEvent) => {
      if (tableSet.has(event.t)) onChange(event);
    },
    [tableSet, onChange],
  );
}
