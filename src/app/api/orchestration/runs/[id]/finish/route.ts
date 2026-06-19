import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { updateOrchestrationRun } from "@/db/queries/orchestration-runs";
import { inferOutcome } from "@/lib/orchestration";
import { ORCHESTRATION_TASK_SUMMARY_FIELDS } from "@/lib/orchestration";
import { ORCHESTRATION_OUTCOMES, type OrchestrationOutcome } from "@/db/schema/orchestration-runs";

const FinishBody = z.object({
  // Outcome can be supplied directly (e.g. user_abort from a cancel button)
  // or omitted to let infer-outcome derive it from the handoff.
  outcome: z.enum(ORCHESTRATION_OUTCOMES).optional(),
  summary: z
    .object(Object.fromEntries(
      ORCHESTRATION_TASK_SUMMARY_FIELDS.map((f) => [f, z.string().trim().max(4000).optional()]),
    ) as Record<typeof ORCHESTRATION_TASK_SUMMARY_FIELDS[number], z.ZodOptional<z.ZodString>>)
    .optional(),
  durationMs: z.number().int().nonnegative().optional(),
  error: z.string().trim().max(2000).optional(),
  userAbort: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const dataOrResp = await readJsonBody(req, FinishBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const body = dataOrResp;

  const summary = body.summary
    ? {
        status: body.summary.status ?? "",
        "last-3-same-dir": body.summary["last-3-same-dir"] ?? "",
        "wip-or-revert-in-last-5": body.summary["wip-or-revert-in-last-5"] ?? "",
        tsc: body.summary.tsc ?? "",
        lint: body.summary.lint ?? "",
        done:   body.summary.done   ?? "",
        next:   body.summary.next   ?? "",
        tests:  body.summary.tests  ?? "",
        todos:  body.summary.todos  ?? "",
        commit: body.summary.commit ?? "",
        health: body.summary.health ?? "",
      }
    : null;

  const outcome: OrchestrationOutcome = body.outcome ?? inferOutcome({
    summary,
    durationMs: body.durationMs,
    error: body.error ?? null,
    userAbort: body.userAbort ?? false,
  });

  const updated = await updateOrchestrationRun(
    id,
    {
      state: outcome === "error" || outcome === "hang" || outcome === "timeout" ? "error" : "done",
      outcome,
      summary: summary ?? undefined,
      finishedAt: new Date(),
    },
    userId,
  );

  if (!updated) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, outcome, runId: id });
}
