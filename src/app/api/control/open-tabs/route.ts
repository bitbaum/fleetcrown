/**
 * GET /api/control/open-tabs — the tabs currently open on the user's machine.
 *
 * Cloud mode: the runner-pushed openTabs (full session list, now including
 * FleetCrown-owned PTY tabs). Local mode: a live zellij query. The /terminal
 * "My machine" view lists these and streams each live via /api/control/peek-stream.
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { getRuntimeSnapshot } from "@/db/queries/runtime-snapshots";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let tabs: string[] = [];
  if (isRuntimeAvailable()) {
    const { getZellijTabs } = await import("@/lib/zellij");
    tabs = await getZellijTabs().catch(() => []);
  } else {
    const snap = await getRuntimeSnapshot(userId).catch(() => null);
    tabs = snap?.openTabs ?? [];
  }
  return NextResponse.json({ tabs });
}
