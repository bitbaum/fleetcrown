import { NextRequest, NextResponse } from "next/server";
import { CreateFilmBody } from "@/config/film";
import { createFilm, listFilms } from "@/db/queries/films";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  return jsonOk({ films: await listFilms(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const dataOrResp = await readJsonBody(req, CreateFilmBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const film = await createFilm(userId, dataOrResp);
  if (!film) return jsonError("Could not create film", 500);
  return NextResponse.json({ ok: true, film }, { status: 201 });
}
