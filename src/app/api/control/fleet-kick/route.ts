/**
 * POST /api/control/fleet-kick — proactively start development loops on
 * eligible fleet projects (next_best dispatch), capped by concurrency.
 *
 * Called when the operator presses Start building (off→on) or says "develop all
 * my projects" in Loki. Reactive autopilot (agent finishes → next task) is
 * unchanged — this is the cold-start / idle nudge half.
 */
import { NextRequest, NextResponse } from "next/server";
import { getApiUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { kickFleet, type FleetKickSource } from "@/lib/fleet-kick";

const Body = z.object({
  projectKeys: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  source: z.enum(["play_button", "loki", "api"]).optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const source = (dataOrResp.source ?? "api") as FleetKickSource;
  const result = await kickFleet(userId, {
    source,
    projectKeys: dataOrResp.projectKeys,
    requireFleetOn: source !== "loki",
  });

  return NextResponse.json(result);
}
