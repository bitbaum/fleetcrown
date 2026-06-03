"use client";

import { useEffect } from "react";
import type { FleetRunnerBridge } from "./types";

/**
 * When the FleetCrown web app is rendered inside the Fleet Runner desktop
 * shell (web-shell mode), the user shouldn't have to copy/paste an agent
 * token from Settings — the app already knows who they are (NextAuth cookie
 * is the same), and the local runtime already has IPC for storing a token.
 *
 * This effect closes that loop silently:
 *   1. Detect `window.fleetRunner` (only present inside Electron).
 *   2. Ask the main process if a token is already saved — bail if yes.
 *   3. POST /api/agent-tokens with browser-session auth (cookies travel
 *      with the request because we're on the same origin as the API).
 *   4. Persist the returned ck_… string via `fleetRunner.saveToken`,
 *      which auto-restarts the main-process poller and the next web
 *      dispatch lands in the user's Zellij with no further setup.
 *
 * Failures degrade gracefully — the user can still mint a token by hand
 * from Settings → Agent tokens, which is the path used when the app is
 * open in a normal browser.
 */
const SESSION_FLAG = "fleetcrown:auto-mint-attempted-v1";

function hasAutoMintBridge(
  b: Window["fleetRunner"],
): b is Pick<FleetRunnerBridge, "loadToken" | "saveToken"> {
  return typeof b?.loadToken === "function" && typeof b?.saveToken === "function";
}

export function FleetRunnerAutoMint() {
  useEffect(() => {
    let cancelled = false;

    async function maybeMint() {
      const bridge = window.fleetRunner;
      if (!hasAutoMintBridge(bridge)) return;

      // Within a single tab/window, run at most once per session — the auto-
      // mint endpoint is cheap, but a hot-reload loop or fast nav storm
      // shouldn't spawn duplicate "Fleet Runner (auto)" tokens.
      try {
        if (window.sessionStorage.getItem(SESSION_FLAG) === "1") return;
        window.sessionStorage.setItem(SESSION_FLAG, "1");
      } catch { /* private mode etc — non-fatal */ }

      try {
        const existing = await bridge.loadToken();
        if (existing) return;
      } catch {
        // If we can't even read the token file, the IPC layer is broken —
        // bailing here is the only safe move.
        return;
      }

      try {
        const res = await fetch("/api/agent-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ label: "Fleet Runner (auto)" }),
        });
        if (!res.ok) {
          // 401 → user is not yet signed in (mount fired during the sign-in
          // page render). The next navigation re-runs this effect.
          return;
        }
        const body = (await res.json()) as { token?: string };
        if (cancelled || !body.token) return;
        await bridge.saveToken(body.token);
        console.info("[fleet-runner] auto-mint complete; main-process poller restarted");
      } catch (err) {
        console.warn("[fleet-runner] auto-mint failed:", (err as Error).message);
      }
    }

    void maybeMint();
    return () => { cancelled = true; };
  }, []);

  return null;
}
