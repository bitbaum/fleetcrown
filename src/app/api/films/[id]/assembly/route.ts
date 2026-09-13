import { NextRequest, NextResponse } from "next/server";
import { getFilm } from "@/db/queries/films";
import { assemblyCommands, buildEditList, concatManifest, editListText } from "@/lib/film/assembly";
import { composeShotSheet } from "@/lib/film/shot-prompt";
import { jsonError, jsonOk, readIdParam } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Everything needed to turn the clips back into a film: the timeline, the
 * concat manifest, the commands to run, and the shot sheet the prompts came
 * from. All text — nothing here runs ffmpeg, and nothing fetches a clip.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const idOrResp = await readIdParam(ctx.params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const detail = await getFilm(userId, idOrResp);
  if (!detail) return jsonError("Film not found", 404);

  const { film, scenes, shots } = detail;
  const editList = buildEditList(shots);
  const sceneById = new Map(scenes.map((s) => [s.id, s]));
  const empty = { heading: null, location: null, timeOfDay: null, synopsis: null };

  return jsonOk({
    editList,
    manifest: concatManifest(editList),
    manifestName: "shots.txt",
    commands: assemblyCommands(`${slugify(film.title)}.mp4`),
    editListText: editListText(film.title, editList),
    shotSheet: composeShotSheet(
      { title: film.title, styleBible: film.styleBible, aspectRatio: film.aspectRatio },
      shots.map((shot) => ({
        scene: shot.sceneId ? (sceneById.get(shot.sceneId) ?? empty) : empty,
        shot,
      })),
    ),
  });
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "film"
  );
}
