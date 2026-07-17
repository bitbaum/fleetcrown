import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, jsonError, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { isValidUuid } from "@/lib/utils";
import { getProjectDossierByOwner, type ProjectDossier } from "@/db/queries/project-dossier";
import { injectPrompt } from "@/lib/inject-core";
import { HEALTH_SIGNAL_BASE } from "@/components/projects/project-detail-types";
import { MINUTE_MS } from "@/lib/constants/time";

/**
 * One-click dispatch of a profile-called-out action. The profile states facts
 * (open security risk, queued next step, a streak of timed-out runs); this
 * route turns each stated fact into a scoped agent run through the same
 * injectPrompt SSOT every other dispatch path uses (channel routing included).
 */

const DispatchBody = z.object({
  kind: z.enum(["fix_signal", "next_step", "diagnose_timeouts"]),
  /** Required for fix_signal: which attention attr to fix. */
  signalKey: z.enum(
    HEALTH_SIGNAL_BASE.map((s) => s.key) as [string, ...string[]],
  ).optional(),
});

function composePrompt(
  kind: "fix_signal" | "next_step" | "diagnose_timeouts",
  signalKey: string | undefined,
  dossier: ProjectDossier,
): { prompt: string; error?: never } | { prompt?: never; error: string } {
  const attrs = dossier.detail.attrs;
  const name = dossier.detail.project.name;
  const dod = attrs.definition_of_done?.trim();
  const closing = [
    dod ? `Definition of done: ${dod}` : "Verify your fix works before claiming done — run the relevant tests or exercise the change.",
    "Record what you actually did (with evidence) in your final session handoff.",
  ].join(" ");

  if (kind === "fix_signal") {
    const signal = HEALTH_SIGNAL_BASE.find((s) => s.key === signalKey);
    const issue = signal ? attrs[signal.key]?.trim() : undefined;
    if (!signal || !issue) return { error: "That issue is no longer recorded on the profile." };
    return {
      prompt: `Fix this called-out issue on ${name}.\n\n${signal.label.toUpperCase()}: ${issue}\n\nScope: fix exactly this issue — no unrelated refactors. ${closing}`,
    };
  }

  if (kind === "next_step") {
    const latest = [...(dossier.detail.devLog ?? [])].reverse()[0] ?? null;
    const next = latest?.next?.trim() || attrs.next_step?.trim();
    if (!next) return { error: "No queued next step to dispatch." };
    return {
      prompt: `Execute the queued next step for ${name}:\n\n${next}\n\n${closing}`,
    };
  }

  const timedOut = dossier.runs
    .filter((run) => run.finishedAt && run.outcome === "timeout")
    .slice(0, 5)
    .map((run) => `- ${run.startedAt.toISOString().slice(0, 10)}: "${run.intent}" ran ~${Math.round(((run.finishedAt as Date).getTime() - run.startedAt.getTime()) / MINUTE_MS)}m then timed out`);
  if (timedOut.length === 0) return { error: "No timed-out runs to diagnose." };
  return {
    prompt: `Diagnose why dispatched agent runs for ${name} keep timing out instead of finishing:\n\n${timedOut.join("\n")}\n\nInvestigate the workspace state (does the checkout exist and build? are handoffs being written? is the agent stalling on a prompt?), identify the most likely root cause, and fix what you can. ${closing}`,
  };
}

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

  const composed = composePrompt(dataOrResp.kind, dataOrResp.signalKey, dossier);
  if (composed.error) return jsonError(composed.error, 409);

  const { status, body } = await injectPrompt(
    { tab: dossier.detail.project.name, customPrompt: composed.prompt },
    userId,
  );
  return NextResponse.json(body, { status });
}
