import type { OrchestrationTaskRequest } from "@/lib/orchestration";
import { runOpenClawIntent } from "@/lib/orchestration/runners/openclaw";
import { ORCH_STATE } from "@/lib/orchestration/contract";
import { parseOrchestrationSummary } from "@/lib/orchestration/summary";
import { updateOrchestrationRun } from "@/db/queries/orchestration-runs";

export async function executeOpenClawRun(runId: string, request: OrchestrationTaskRequest) {
  try {
    const result = await runOpenClawIntent(request);
    const summary = parseOrchestrationSummary(result.text);

    await updateOrchestrationRun(runId, {
      state: result.ok ? "done" : "error",
      summary,
      payload: {
        projectKey: request.projectKey,
        projectPath: request.projectPath,
        model: result.model ?? request.model,
        resultText: result.text,
        raw: result.raw,
        durationMs: result.durationMs,
        error: result.error,
      },
      finishedAt: new Date(),
    });

    return { ok: result.ok, summary: summary ?? null, error: result.error ?? null };
  } catch (error) {
    await updateOrchestrationRun(runId, {
      state: ORCH_STATE.ERROR,
      payload: {
        projectKey: request.projectKey,
        projectPath: request.projectPath,
        model: request.model,
        error: error instanceof Error ? error.message : "OpenClaw run crashed",
      },
      finishedAt: new Date(),
    });

    throw error;
  }
}
