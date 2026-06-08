/**
 * GET /api/control/runtime-state/desired
 *
 * The "desired state" for Fleet Runner's cold-start path. By design, the most
 * recent runtime_snapshots.panes IS the desired state: whatever was running
 * last is what should be running now. Fleet Runner reads this on boot,
 * generates a zellij KDL layout, and spawns the session — no manual restore
 * step.
 *
 * Bearer-authenticated (cookie or ck_* agent token) — same auth surface as
 * /api/control/runtime-state POST.
 */

import { NextResponse } from "next/server";
import { getRuntimeSnapshot } from "@/db/queries/runtime-snapshots";
import { getApiUserId } from "@/lib/session";

const DEFAULT_SESSION_NAME = "fleet";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snapshot = await getRuntimeSnapshot(userId);
  return NextResponse.json({
    panes: snapshot?.panes ?? [],
    sessionName: DEFAULT_SESSION_NAME,
    observedAt: snapshot?.observedAt?.getTime() ?? null,
  });
}
