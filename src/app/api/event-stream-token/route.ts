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
import { createAgentToken, listAgentTokens } from "@/db/queries/agent-tokens";
import { getOwnerOrgId } from "@/db/queries/orgs";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prefer reusing a recent event-stream token if one already exists
  // and was used in the last 7 days. The listAgentTokens query never
  // returns the plaintext value (only metadata), so we always mint a
  // fresh one here regardless — the cost of mint is a single insert
  // and a 64-char string returned to the client, which we eat for
  // simplicity. If/when token mint becomes a hot path, swap in a
  // dedicated event_stream_tokens table with TTL.
  const orgId = await getOwnerOrgId(userId).catch(() => null);
  const { token } = await createAgentToken(userId, "event-stream", orgId);

  // Touch — count existing event-stream tokens for hygiene logs.
  const all = await listAgentTokens(userId).catch(() => []);
  const eventStreamCount = all.filter((t) => t.label === "event-stream").length;

  return NextResponse.json(
    { token, label: "event-stream", existingCount: eventStreamCount },
    {
      // Never cache. This response contains a secret bound to the
      // session that requested it.
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    },
  );
}
