import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, jsonError, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { isValidUuid } from "@/lib/utils";
import { getProjectDossierByOwner } from "@/db/queries/project-dossier";
import { injectPrompt } from "@/lib/inject-core";
import { HEALTH_SIGNAL_BASE } from "@/components/projects/project-detail-types";
import { PROJECT_DISPATCH_KINDS } from "@/lib/project-dispatch";
import { composeDispatchPrompt } from "@/lib/project-dispatch-prompt";

/**
 * One-click dispatch of a profile-called-out action. The profile states facts
 * (open security risk, queued next step, a streak of timed-out runs); this
 * route turns each stated fact into a scoped agent run through the same
 * injectPrompt SSOT every other dispatch path uses (channel routing included).
 *
 * The prompts themselves live in lib/project-dispatch-prompt so they can be
 * tested — they are the product, not an implementation detail of this handler.
 */

const DispatchBody = z.object({
  kind: z.enum(PROJECT_DISPATCH_KINDS),
  /** Required for fix_signal: which attention attr to fix. */
  signalKey: z.enum(
    HEALTH_SIGNAL_BASE.map((s) => s.key) as [string, ...string[]],
  ).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const { id } = await params;
  if (!isValidUuid(id)) return jsonError("Invalid project id", 400);

  const dataOrResp = await readJsonBody(req, DispatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  // Owner-only: dispatching work is a write, org peers see the page read-only.
  const dossier = await getProjectDossierByOwner(userId, id);
  if (!dossier) return jsonError("Project not found", 404);

  const composed = composeDispatchPrompt(dataOrResp.kind, dataOrResp.signalKey, dossier);
  if (composed.error) return jsonError(composed.error, 409);

  const { status, body } = await injectPrompt(
    { tab: dossier.detail.project.name, customPrompt: composed.prompt, notifyOnClose: true },
    userId,
  );
  return NextResponse.json(body, { status });
}
