import { NextRequest, NextResponse } from "next/server";
import { PatchFilmBody } from "@/config/film";
import { deleteFilm, getFilm, patchFilm } from "@/db/queries/films";
import { jsonError, jsonOk, readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const idOrResp = await readIdParam(ctx.params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const detail = await getFilm(userId, idOrResp);
  if (!detail) return jsonError("Film not found", 404);
  return jsonOk({ ...detail });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const idOrResp = await readIdParam(ctx.params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, PatchFilmBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const film = await patchFilm(userId, idOrResp, dataOrResp);
  if (!film) return jsonError("Film not found", 404);
  return jsonOk({ film });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const idOrResp = await readIdParam(ctx.params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  return (await deleteFilm(userId, idOrResp))
    ? jsonOk({ deleted: true })
    : jsonError("Film not found", 404);
}
