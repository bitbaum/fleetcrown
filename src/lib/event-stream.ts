// Client-side helpers for connecting to the FleetCrown event bridge.
//
// The bridge URL is configured via NEXT_PUBLIC_FLEETCROWN_BRIDGE_URL. The
// canonical production origin may use the brand default; localhost, preview,
// and custom origins stay disabled unless explicitly configured. The app's
// same-origin control stream remains available as the local fallback.

import { useEffect, useRef, useState } from "react";
import { APP_DOMAIN, BRIDGE_URL } from "@/config/brand";
import type { ChangeEvent } from "./event-stream-types";

/** Re-export under the legacy name to avoid breaking existing call sites
 *  that import { BridgeChangeEvent }. The canonical type lives in
 *  event-stream-types.ts and is shared with the desktop subscriber. */
export type BridgeChangeEvent = ChangeEvent;

export type EventStreamState =
  | { mode: "disabled" }
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
}): EventStreamState {
  const { onChange } = opts;
  const [state, setState] = useState<EventStreamState>({ mode: "connecting" });

  // Keep the latest onChange in a ref so we don't tear down the EventSource
  // every time the parent component re-renders with a new closure.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const resolvedSseBase = bridgeUrl();
    if (!resolvedSseBase) {
      setState({ mode: "disabled" });
      return;
    }
    const sseBase: string = resolvedSseBase;

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
    // Effect runs once per mount. The bridge URL is stable for the lifetime
    // of the session (resolved from build-time env + brand constant).
  }, []);

  return state;
}

/** Resolve the bridge SSE URL. Explicit configuration wins everywhere. The
 * canonical production host uses the brand default; other origins opt out so
 * local/preview sessions never mint a token for a cross-origin stream they
 * cannot consume. */
let cachedUrl: string | null | undefined;
function bridgeUrl(): string | null {
  if (cachedUrl !== undefined) return cachedUrl;
  const override = (process.env.NEXT_PUBLIC_FLEETCROWN_BRIDGE_URL ?? "").trim();
  if (override.length > 0) {
    cachedUrl = override;
    return cachedUrl;
  }
  cachedUrl = typeof window !== "undefined" && window.location.hostname === APP_DOMAIN
    ? BRIDGE_URL
    : null;
  return cachedUrl;
}
