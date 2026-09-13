import { NextRequest, NextResponse } from "next/server";
import { BreakdownFilmBody, configuredMaxClipSeconds } from "@/config/film";
import { countShotsWithClips, getFilm, replaceBreakdown } from "@/db/queries/films";
import { breakdownScreenplay } from "@/lib/film/breakdown";
import { checkAiBudget, recordAiSpend } from "@/lib/ai-budget/gate";
import { jsonError, jsonOk, readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { denyDemoInHandler } from "@/lib/demo-guard";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Screenplay → scenes → clip-sized shots.
 *
 * Re-running this replaces the shot list wholesale, which means any clip URL
 * attached to the old one is gone. So a breakdown over shots that already have
 * takes is refused unless the caller passes `replaceGenerated` — the operator
 * has to say the word, because the alternative is discovering it afterwards.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  // The rest of /api/films only touches the caller's own rows, so the family is
  // demo-safe (see config/demo.ts). This call spends real model credit on a
  // shared public account, so it is denied here — it cannot live in
  // DEMO_HANDLER_ENFORCED, which is for families the proxy matcher excludes,
  // and a prefix rule cannot express "only the two routes under /api/films/<id>
  // that call a model".
  const demoDenied = await denyDemoInHandler(userId, "spend");
  if (demoDenied) return demoDenied;

  const idOrResp = await readIdParam(ctx.params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, BreakdownFilmBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const detail = await getFilm(userId, idOrResp);
  if (!detail) return jsonError("Film not found", 404);

  const { film } = detail;
  if (!film.screenplay?.trim()) {
    return jsonError("Write or paste a screenplay first — there is nothing to break down.", 400);
  }

  if (!dataOrResp.replaceGenerated) {
    const withClips = await countShotsWithClips(userId, film.id);
    if (withClips > 0) {
      return jsonError(
        `${withClips} shot${withClips === 1 ? " already has a clip" : "s already have clips"}. Re-running the breakdown discards them.`,
        409,
        { shotsWithClips: withClips },
      );
    }
  }

  const budget = await checkAiBudget(userId);
  if (!budget.allowed) {
    return jsonError(budget.message, 429, { retryAfterSeconds: budget.retryAfterSeconds });
  }

  // Explicit request wins; otherwise the film keeps the ceiling it was created
  // with, and only a film that has never been broken down picks up the
  // installation's current default.
  const maxClipSeconds =
    dataOrResp.maxClipSeconds ??
    (film.brokenDownAt ? film.maxClipSeconds : configuredMaxClipSeconds());

  let result;
  try {
    result = await breakdownScreenplay({
      screenplay: film.screenplay,
      title: film.title,
      styleBible: film.styleBible,
    });
  } catch (e) {
    console.error("[films] breakdown failed:", e instanceof Error ? e.message : e);
    return jsonError("The breakdown could not be run. Try again in a moment.", 502);
  }
  await recordAiSpend(userId, 0);

  if (result.scenes.length === 0) {
    return jsonError("Nothing usable came back. Check the screenplay and try again.", 502);
  }

  const counts = await replaceBreakdown(userId, film.id, result.scenes, maxClipSeconds);
  return jsonOk({
    ...counts,
    maxClipSeconds,
    // Surfaced rather than swallowed: a film broken down from four chunks where
    // one failed is missing a stretch of itself, and the operator can only
    // notice that if they are told.
    failedChunks: result.failedChunks,
  });
}
