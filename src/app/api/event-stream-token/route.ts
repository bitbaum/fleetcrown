// Mint or reuse a ck_* token for the signed-in user so the browser can
// authenticate to the SSE bridge.
//
// EventSource (the browser SSE API) cannot set custom headers, so the
// bridge accepts the token as a `?token=ck_*` query parameter. Rather
// than embedding ck_* in HTML or localStorage, we route through this
// endpoint:
//   - Browser fetches /api/event-stream-token on session start.
//   - Server validates the auth.js session cookie.
//   - Returns the user's most-recent live token, or mints a new one
//     with a short label ("event-stream") so it's clearly tagged.
//
// The token then lives only in the lifetime of the EventSource (a
// closure variable in the browser). It is never persisted client-side.
// Tab close discards it; the next session calls this endpoint again.
//
// Why mint a fresh token instead of always re-using a single one: each
// browser session gets its own. Revoking a session (closing all tabs +
// signing out elsewhere) doesn't accidentally kill the daemon's ck_*
// token, and vice versa. Token surface stays per-purpose.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createAgentToken, getReusableEventStreamToken } from "@/db/queries/agent-tokens";
import { getOwnerOrgId } from "@/db/queries/orgs";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reuse a recent event-stream token if one exists and was used in the
  // last 7 days; otherwise mint a fresh one. Pre-2026-06-07 this endpoint
  // ALWAYS minted, which leaked ~1 token per browser session per day per
  // user (caught in DB inspection: 10 stale 'event-stream' rows for a
  // single account over 36 hours). Reuse caps the per-user footprint at
  // "one live token per active week."
  //
  // Reuse uses last_used_at — the bridge stamps it on every successful
  // validateAgentToken call, so the freshness signal is real bridge
  // activity, not just mint age. A token minted 6 days ago but used 1 hour
  // ago counts as reusable.
  const reused = await getReusableEventStreamToken(userId).catch(() => null);
  if (reused) {
    return NextResponse.json(
      { token: reused.token, label: "event-stream", reused: true },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } },
    );
  }

  const orgId = await getOwnerOrgId(userId).catch(() => null);
  const { token } = await createAgentToken(userId, "event-stream", orgId);

  return NextResponse.json(
    { token, label: "event-stream", reused: false },
    {
      // Never cache. This response contains a secret bound to the
      // session that requested it.
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    },
  );
}
