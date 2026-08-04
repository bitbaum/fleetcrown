import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, jsonError, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { isValidUuid } from "@/lib/utils";
import { getProjectDossierByOwner, type ProjectDossier } from "@/db/queries/project-dossier";
import { injectPrompt } from "@/lib/inject-core";
import { HEALTH_SIGNAL_BASE } from "@/components/projects/project-detail-types";
import { MINUTE_MS } from "@/lib/constants/time";
import { PROJECT_DISPATCH_KINDS, type ProjectDispatchKind } from "@/lib/project-dispatch";
import { cleanDescription } from "@/lib/project-display";

/**
 * One-click dispatch of a profile-called-out action. The profile states facts
 * (open security risk, queued next step, a streak of timed-out runs); this
 * route turns each stated fact into a scoped agent run through the same
 * injectPrompt SSOT every other dispatch path uses (channel routing included).
 */

const DispatchBody = z.object({
  kind: z.enum(PROJECT_DISPATCH_KINDS),
  /** Required for fix_signal: which attention attr to fix. */
  signalKey: z.enum(
    HEALTH_SIGNAL_BASE.map((s) => s.key) as [string, ...string[]],
  ).optional(),
});

function composePrompt(
  kind: ProjectDispatchKind,
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

  if (kind === "kickoff") {
    const description = cleanDescription(dossier.detail.project.description);
    // Creation order is the build order — the list itself is sorted by progress
    // for the human reading it, which on a fresh roadmap says nothing.
    const milestones = [...dossier.detail.linkedGoals].sort(
      (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
    );
    const target = milestones.find((goal) => (goal.progress ?? 0) < 100) ?? null;
    if (!description && !target) {
      return { error: "Describe the project first — there is nothing to brief an agent with." };
    }

    const profile = ([
      ["Mission", attrs.mission],
      ["Problem", attrs.problem],
      ["Solution", attrs.solution],
      ["Stack", attrs.stack],
      ["Architecture", attrs.architecture],
      ["Conventions", attrs.conventions],
    ] as Array<[string, string | undefined]>)
      .filter((row): row is [string, string] => Boolean(row[1]?.trim()))
      .map(([label, value]) => `${label.toUpperCase()}: ${value.trim()}`);

    const roadmap = milestones.map((goal, i) =>
      `${i + 1}. ${goal.title}${goal.description ? ` — ${goal.description}` : ""}`,
    );

    return {
      prompt: [
        `Start building ${name}. This project is being kicked off — treat the repository as possibly empty.`,
        description ? `\nWHAT IT IS: ${description}` : "",
        profile.length > 0 ? `\n${profile.join("\n")}` : "",
        roadmap.length > 0 ? `\nBUILD ROADMAP (tracked as this project's goals):\n${roadmap.join("\n")}` : "",
        target
          ? `\nYOUR TARGET THIS RUN: ${target.title}${target.description ? `\n${target.description}` : ""}`
          : "\nYOUR TARGET THIS RUN: get the project to its first working, runnable state.",
        `\nScope: deliver that target only — do not attempt the whole roadmap in one run. If the repository is empty, scaffold the minimum that makes the target real and runnable, and commit it. ${closing}`,
      ].filter(Boolean).join("\n"),
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
