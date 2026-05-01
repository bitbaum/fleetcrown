import fs from "node:fs";
import path from "node:path";
import { runOpenClawIntent } from "@/lib/orchestration/runners/openclaw";
import type { OrchestrationTaskRequest } from "@/lib/orchestration";
import { parseOrchestrationSummary } from "@/lib/orchestration/summary";
import { updateOrchestrationRun } from "@/db/queries/orchestration-runs";

async function main() {
  const encoded = process.argv[2];
  if (!encoded) throw new Error("Missing payload");

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    runId: string;
    request: OrchestrationTaskRequest;
  };

  const { runId, request } = payload;
  const logPath = path.join(process.cwd(), ".next", "logs", `openclaw-worker-${runId}.log`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = (msg: string) => fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);

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
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
