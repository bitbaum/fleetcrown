import { NextResponse, type NextRequest } from "next/server";
import { getApiUserId } from "@/lib/session";
import { isValidUuid } from "@/lib/utils";
import { stampRunProgress } from "@/db/queries/orchestration-runs";
import { emitRunEvent } from "@/db/queries/run-events";

/**
 * Runner heartbeat for a dispatched run — PATCH /api/control/runs/:id/progress
 * body: { outputBytes: number, lastOutputAt: ISO }. Bearer runner token, like
 * the command ack. Answers { ok, live } — live:false once the run is closed,
 * which tells the runner to stop beating. Contract: src/lib/run-progress.ts.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isValidUuid(id)) return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    outputBytes?: unknown;
    lastOutputAt?: unknown;
  };
  const outputBytes =
    typeof body.outputBytes === "number" && Number.isFinite(body.outputBytes)
      ? Math.max(0, Math.min(Math.round(body.outputBytes), 1_000_000_000))
      : 0;
  const lastOutputAt =
    typeof body.lastOutputAt === "string" && !Number.isNaN(Date.parse(body.lastOutputAt))
      ? body.lastOutputAt
      : null;
  const live = await stampRunProgress(id, userId);
  if (live) void emitRunEvent(id, userId, "progress", { outputBytes, lastOutputAt });
  return NextResponse.json({ ok: true, live });
}
