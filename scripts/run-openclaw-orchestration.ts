import fs from "node:fs";
import path from "node:path";
import { runOpenClawIntent } from "@/lib/orchestration/runners/openclaw";
import type { OrchestrationTaskRequest } from "@/lib/orchestration";
import { parseOrchestrationSummary } from "@/lib/orchestration/summary";
import { updateOrchestrationRun } from "@/db/queries/orchestration-runs";
import { createOrchestrationEvent } from "@/db/queries/orchestration-events";

async function main() {
  const encoded = process.argv[2];
  if (!encoded) throw new Error("Missing payload");

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    runId: string;
    userId: string;
    request: OrchestrationTaskRequest;
  };

  const { runId, userId, request } = payload;
  const logPath = path.join(process.cwd(), ".next", "logs", `openclaw-worker-${runId}.log`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = (msg: string) => fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);

  // Emit task_completed (success) or task_failed (error) to close the pair
  // started by the route at line ~385. Without this, every openclaw run on
  // the happy path showed task_started but never task_completed, leaving
  // dispatch-success-rate queries unable to count completions for openclaw.
  const emitLifecycleEvent = async (eventType: "task_completed" | "task_failed", detail: string) => {
    try {
      await createOrchestrationEvent({
        userId,
        projectId: request.projectId ?? null,
        projectKey: request.projectKey,
        eventType,
        source: "openclaw-worker",
        adapter: request.adapter,
        intent: request.intent,
        detail: detail.slice(0, 400),
        happenedAt: new Date(),
      });
    } catch (e) {
      log(`emitLifecycleEvent ${eventType} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  log("worker start");
  log(`project=${request.projectKey} intent=${request.intent}`);

  try {
    log("before runOpenClawIntent");
    const result = await runOpenClawIntent(request);
    log(`after runOpenClawIntent ok=${result.ok} model=${result.model ?? ""} durationMs=${result.durationMs ?? ""}`);
    const summary = parseOrchestrationSummary(result.text);

    log("before updateOrchestrationRun success/error");
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
    log("after updateOrchestrationRun success/error");
    // Canonical detail shape across all task_completed/task_failed emit sites:
    //   success → "<intent>"            (no trailing " done" — redundant with eventType)
    //   failure → "<intent>: <error>"   (colon separator, not em-dash)
    await emitLifecycleEvent(
      result.ok ? "task_completed" : "task_failed",
      result.ok ? request.intent : `${request.intent}: ${result.error ?? "openclaw returned not-ok"}`,
    );
  } catch (error) {
    log(`catch error=${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    await updateOrchestrationRun(runId, {
      state: "error",
      payload: {
        projectKey: request.projectKey,
        projectPath: request.projectPath,
        model: request.model,
        error: error instanceof Error ? error.message : "OpenClaw run crashed",
      },
      finishedAt: new Date(),
    });
    log("after updateOrchestrationRun catch");
    await emitLifecycleEvent("task_failed", `${request.intent}: ${error instanceof Error ? error.message : "OpenClaw run crashed"}`);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
