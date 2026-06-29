/**
 * POST /api/control/fleet-pause — batch pause autopilot on selected projects.
 */
import { NextRequest, NextResponse } from "next/server";
import { getApiUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { pauseFleetProjects } from "@/lib/fleet-pause";

const Body = z.object({
  projectKeys: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const result = await pauseFleetProjects(userId, dataOrResp.projectKeys);
  return NextResponse.json(result);
}
