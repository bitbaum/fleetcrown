import { NextRequest, NextResponse } from "next/server";
import { getFilm, patchFilm } from "@/db/queries/films";
import { draftScreenplay } from "@/lib/film/breakdown";
import { checkAiBudget, recordAiSpend } from "@/lib/ai-budget/gate";
import { jsonError, jsonOk, readIdParam } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { denyDemoInHandler } from "@/lib/demo-guard";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Premise → screenplay.
 *
 * Refuses to overwrite an existing screenplay. Regenerating over the top of one
 * the operator has edited is the single most destructive thing this endpoint
 * could do, and "it can be regenerated" is not true of the half hour they spent
 * fixing the third scene. Clearing the field is an explicit PATCH.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
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

  const detail = await getFilm(userId, idOrResp);
  if (!detail) return jsonError("Film not found", 404);

  const { film } = detail;
  if (film.screenplay?.trim()) {
    return jsonError("This film already has a screenplay. Clear it first to rewrite.", 409);
  }
  if (!film.premise?.trim()) {
    return jsonError("Add a premise first — there is nothing to write from.", 400);
  }

  const budget = await checkAiBudget(userId);
  if (!budget.allowed) {
    return jsonError(budget.message, 429, { retryAfterSeconds: budget.retryAfterSeconds });
  }

  let screenplay: string;
  try {
    screenplay = await draftScreenplay({
      title: film.title,
      premise: film.premise,
      styleBible: film.styleBible,
      targetRuntimeSeconds: film.targetRuntimeSeconds,
    });
  } catch (e) {
    console.error("[films] screenplay draft failed:", e instanceof Error ? e.message : e);
    return jsonError("The writer could not be reached. Try again in a moment.", 502);
  }

  // The provider does not report usage through this path, so the spend is
  // recorded at the gate's own estimate rather than not at all — an unbilled
  // call is how a budget quietly stops being a budget.
  await recordAiSpend(userId, 0);

  if (!screenplay) return jsonError("The writer returned nothing. Try again.", 502);

  const updated = await patchFilm(userId, film.id, { screenplay });
  return jsonOk({ film: updated, screenplay });
}
