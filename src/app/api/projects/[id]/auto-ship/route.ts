import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody, jsonOk, jsonError, z } from "@/lib/api/route-helpers";
import { getUserProjectByEntityId, setProjectAutoShip } from "@/db/queries/user-projects";

/**
 * "Ship fixes automatically" for one project — may FleetCrown merge the pull
 * request an agent opened for a visitor's report, once it is genuinely green?
 *
 * Addressed by ENTITY project id, like the widget token beside it, because
 * that is the id the project page holds. See src/lib/feedback/auto-ship.ts for
 * what "green" has to mean before anything merges.
 */
const Body = z.object({ autoShip: z.boolean() });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const project = await getUserProjectByEntityId(userId, idOrResp);
  if (!project) return jsonError("Project not found", 404);
  // null is a real answer: never chosen. The UI invites instead of showing a
  // switch that looks like somebody's decision.
  return jsonOk({ autoShip: project.autoShip ?? null, hasRepo: !!project.gitUrl });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const updated = await setProjectAutoShip(userId, idOrResp, dataOrResp.autoShip);
  if (!updated) return jsonError("Project not found", 404);
  return jsonOk({ autoShip: updated.autoShip ?? null });
}
