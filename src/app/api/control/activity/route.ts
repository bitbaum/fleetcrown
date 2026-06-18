/**
 * GET /api/control/activity?tab=<projectKey>&days=<n>&limit=<n>
 *
 * Per-project activity timeline — the JSON read side of the unified activity
 * SSOT (src/db/queries/activity.ts). One stream merging dispatches, run
 * outcomes, and lifecycle signals; rendered by the Activity panel in the
 * control drawer. Read-only; scoped to the session user.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getProjectActivity } from "@/db/queries/activity";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const tab = params.get("tab")?.trim();
  if (!tab) return NextResponse.json({ error: "tab required" }, { status: 400 });

  const days = Math.min(Math.max(Number(params.get("days")) || 7, 1), 90);
  const limit = Math.min(Math.max(Number(params.get("limit")) || 100, 1), 300);

  const events = await getProjectActivity(userId, tab, { days, limit });
  return NextResponse.json({ events });
}
