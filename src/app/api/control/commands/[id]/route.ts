import { NextRequest, NextResponse } from "next/server";
import { getCommandById, markCommandExecuted } from "@/db/queries/pending-commands";
import { emitRunEvent } from "@/db/queries/run-events";
import { getApiUserId } from "@/lib/session";

// Runner calls this to mark a command as executed.
// PATCH /api/control/commands/:id  body: { ok: boolean, error?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ok = typeof body.ok === "boolean" ? body.ok : true;
  const error = typeof body.error === "string" ? body.error : undefined;
  const text = typeof body.text === "string" ? body.text : undefined;
  // warning/verified previously fell on the floor here — the runner's honest
  // "injected, but the agent isn't generating" never reached the DB or UI.
  const warning = typeof body.warning === "string" ? body.warning : undefined;
  const verified = typeof body.verified === "boolean" ? body.verified : undefined;

  const updated = await markCommandExecuted(id, userId, { ok, text, error, warning, verified });
  if (!updated) return NextResponse.json({ error: "Command not found" }, { status: 404 });

  // Run ledger: project the runner's ack onto the dispatch's run. A clean ack
  // = the prompt verifiably submitted; a warning = the agent is blocked
  // (boot dialog, dead credentials, not generating) — visible as an event
  // instead of buried in a result column nobody queries.
  try {
    const command = await getCommandById(id);
    const runId = (command?.payload as { runId?: string } | null)?.runId;
    if (runId) {
      if (!ok) void emitRunEvent(runId, userId, "blocked", { reason: error ?? "runner error" });
      else if (warning) void emitRunEvent(runId, userId, "blocked", { reason: warning });
      else void emitRunEvent(runId, userId, "submitted", { text });
    }
  } catch { /* telemetry only — never fail the ack */ }

  return NextResponse.json({ ok: true });
}
