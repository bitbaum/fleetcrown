import { NextRequest, NextResponse } from "next/server";
import { readIdParam, jsonOk, jsonError } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { getActionById } from "@/db/queries/actions";
import { adviseAction } from "@/lib/actions/advisor";

/**
 * What should the operator do with this queued action, and why.
 *
 * Pure read: the advisor is rules-only (no model, no network), so this is a
 * DB lookup plus a parse — cheap enough for the popup to fetch on open rather
 * than precomputing and storing a verdict that could go stale against an
 * edited payload.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const idOrResp = await readIdParam(ctx.params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const action = await getActionById(userId, idOrResp);
  if (!action) return jsonError("Action not found", 404);

  return jsonOk({
    advice: adviseAction({
      id: action.id,
      title: action.title,
      type: action.type,
      payload: action.payload,
      createdAt: action.createdAt,
      expiresAt: action.expiresAt,
    }),
  });
}
