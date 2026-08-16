// POST /api/activity/session-end
//
// The closing edge of an agent turn. Called by the Claude `Stop` hook, which
// fires when the agent finishes responding — so the window between
// /api/activity/capture and this route IS the turn, and an open window is the
// only evidence of "working" that comes from the agent itself rather than from
// guessing at a process table or a terminal tab name.
//
// Auth: Bearer token, same contract as /api/activity/capture — Claude hooks are
// plain shell scripts with no browser context. /api/activity is excluded from
// the cookie middleware (public ingest lives under it), so the check below is
// the only gate. Do not remove it.
//
// Always answers 200 for a well-formed request, including for a session id we
// have never seen (the Stop hook can outlive a capture that never landed, and
// a hook that returns errors is a hook the user turns off). Failures are
// reported in the body, not the status.

import { NextRequest, NextResponse } from "next/server";
import { getApiUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { endAgentTurn } from "@/db/queries/agent-sessions";

const Body = z.object({
  // Claude sends snake_case; camelCase is accepted so a caller that reshapes
  // the payload is not silently ignored — the bug this route exists to avoid
  // repeating (see the capture route's session_id comment).
  session_id: z.string().max(200).optional(),
  sessionId: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonBody(req, Body);
  if (parsed instanceof NextResponse) return parsed;

  const sessionId = (parsed.session_id ?? parsed.sessionId)?.trim();
  if (!sessionId) return NextResponse.json({ skipped: "no_session_id" });

  const closed = await endAgentTurn(userId, sessionId).catch(() => false);
  return NextResponse.json({ ok: true, closed });
}
