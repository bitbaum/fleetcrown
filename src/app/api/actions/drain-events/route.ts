import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrivateApiAccessWithBearer } from "@/lib/private-zone-api";
import { readJsonBody } from "@/lib/api/route-helpers";
import {
  getApprovedActionsByType,
  getActionById,
  markActionExecuted,
} from "@/db/queries/actions";
import { recordActionAuditEvent } from "@/db/queries/control-audit-events";
import { ACTION_TYPE } from "@/lib/constants/statuses";

/**
 * Calendar-event drain seam for the LOCAL runtime.
 *
 * Calendar writes run through the locally-authenticated `gog` CLI, which only
 * exists on the operator's machine. When an event is approved on the cloud
 * control plane, executeAction leaves it 'approved' (see execute-action.ts).
 * The local drain (home/calendar-drain.ts) polls GET here for those rows, books
 * each via gog, then POSTs the result back so the row advances to 'executed'.
 *
 * The `actions` table stays the single source of truth — we do NOT copy the
 * intent into pending_commands. Bearer (ck_*) or session auth, per-user scoped.
 */

// GET — approved-but-unbooked calendar events awaiting the local runtime.
export async function GET() {
  const access = await requirePrivateApiAccessWithBearer();
  if (access instanceof NextResponse) return access;
  const { userId } = access;

  const rows = await getApprovedActionsByType(userId, ACTION_TYPE.CREATE_EVENT);
  const events = rows.map((r) => ({ id: r.id, title: r.title, payload: r.payload }));
  return NextResponse.json({ events });
}

const DrainResultBody = z.object({
  id: z.string().uuid(),
  ok: z.boolean(),
  eventId: z.string().optional(),
  htmlLink: z.string().optional(),
  error: z.string().max(1000).optional(),
});

// POST — the local runtime reports the outcome of booking one event.
export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccessWithBearer();
  if (access instanceof NextResponse) return access;
  const { userId } = access;

  const dataOrResp = await readJsonBody(req, DrainResultBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { id, ok, eventId, htmlLink, error } = dataOrResp;

  if (!ok) {
    // Booking failed on the local side — leave the row 'approved' for a retry on
    // the next drain pass, but record why so a permanently-bad event is visible.
    const row = await getActionById(userId, id);
    if (row) await recordActionAuditEvent(userId, row, "failed", { reason: error ?? "gog booking failed" });
    return NextResponse.json({ ok: false, marked: false });
  }

  // Guarded approved → executed; a second report for the same row is a no-op.
  const executed = await markActionExecuted(id, userId);
  if (!executed) return NextResponse.json({ ok: true, marked: false });
  await recordActionAuditEvent(userId, executed, "executed", {
    meta: { eventId: eventId ?? null, htmlLink: htmlLink ?? null, via: "local-drain" },
  });
  return NextResponse.json({ ok: true, marked: true });
}
