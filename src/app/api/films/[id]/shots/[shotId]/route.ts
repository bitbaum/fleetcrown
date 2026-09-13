import { NextRequest, NextResponse } from "next/server";
import { PatchShotBody } from "@/config/film";
import { patchShot } from "@/db/queries/films";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { isValidUuid } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string; shotId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { id, shotId } = await ctx.params;
  if (!isValidUuid(id) || !isValidUuid(shotId)) return jsonError("Invalid id", 400);

  const dataOrResp = await readJsonBody(req, PatchShotBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const shot = await patchShot(userId, id, shotId, dataOrResp);
  if (!shot) return jsonError("Shot not found", 404);
  return jsonOk({ shot });
}
