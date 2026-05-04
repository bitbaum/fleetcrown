import { NextRequest, NextResponse } from "next/server";
import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execAsync = promisify(exec);
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { injectIntoTab } from "@/lib/zellij";
import { resolveEffectiveTab } from "@/lib/claude-config";
import {
  ORCHESTRATION_ADAPTER_IDS,
  ORCHESTRATION_TASK_INTENT_IDS,
  type AdapterId,
  type OrchestrationTaskIntentId,
  type OrchestrationTaskRequest,
} from "@/lib/orchestration";
import { getAdapterDefinition, getOrchestrationIntent, renderTaskForAdapter } from "@/lib/orchestration";
import { createOrchestrationRun, updateOrchestrationRun } from "@/db/queries/orchestration-runs";
import { insertPromptHistory } from "@/db/queries/prompt-history";
import { getCurrentUserId } from "@/lib/session";

const RunOrchestrationBody = z.object({
  projectKey: z.string().trim().min(1).max(120),
  projectPath: z.string().trim().min(1).max(500),
  adapter: z.enum(ORCHESTRATION_ADAPTER_IDS).default("openclaw"),
  intent: z.enum(ORCHESTRATION_TASK_INTENT_IDS),
  model: z.string().trim().max(160).optional(),
  customInstructions: z.string().trim().max(4000).optional(),
});

async function scheduleOpenClawWorker(runId: string, request: OrchestrationTaskRequest) {
  const workerPath = path.join(process.cwd(), "scripts", "run-openclaw-orchestration.ts");
  const payload = Buffer.from(JSON.stringify({ runId, request }), "utf8").toString("base64url");
  const command = `cd ${JSON.stringify(process.cwd())} && set -a && source .env.local >/dev/null 2>&1 && npx tsx ${JSON.stringify(workerPath)} ${JSON.stringify(payload)}`;
  const child = spawn("bash", ["-lc", command], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Worker spawn timeout")), 2000);
    child.on("spawn", () => { clearTimeout(timer); child.unref(); resolve(); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, RunOrchestrationBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const userId = await getCurrentUserId();
  const request: OrchestrationTaskRequest = dataOrResp as OrchestrationTaskRequest;
  const adapter = getAdapterDefinition(request.adapter as AdapterId);
  const intent = getOrchestrationIntent(request.intent as OrchestrationTaskIntentId);

  // Log every dispatch regardless of adapter — foundation for reuse suggestions and analytics
  insertPromptHistory(userId, {
    projectKey: request.projectKey,
    projectPath: request.projectPath,
    adapter: request.adapter as AdapterId,
    intent: request.intent as OrchestrationTaskIntentId,
    customPrompt: request.intent === "custom" ? (request.customInstructions ?? null) : null,
  }).catch(() => {});

  // Inject-based adapters: render the task prompt and inject it into the zellij tab.
  // No DB run created — tracking comes from zellij session hooks.
  if (request.adapter === "claude" || request.adapter === "codex") {
    try {
      const prompt = renderTaskForAdapter(request);
      // Resolve alias: "Cockpit" may be running as "Cockpit Claude" in this session.
      let effectiveKey = request.projectKey;
      try {
        const { stdout } = await execAsync("zellij action query-tab-names", { timeout: 2000 });
        const activeTabs = stdout.trim().split("\n").map((t) => t.trim()).filter(Boolean);
        effectiveKey = resolveEffectiveTab(request.projectKey, activeTabs);
      } catch { /* Zellij unavailable — use projectKey as-is */ }
      injectIntoTab(effectiveKey, prompt);
      return NextResponse.json({ ok: true, injected: true, adapter: request.adapter, intent: request.intent });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Inject failed: ${message}` }, { status: 500 });
    }
  }

  if (request.adapter !== "openclaw") {
    return NextResponse.json({
      error: `${adapter.label} runner is not implemented yet`,
      adapter,
      intent,
    }, { status: 501 });
  }

  const run = await createOrchestrationRun({
    userId,
    adapter: request.adapter,
    intent: request.intent,
    state: "running",
    projectKey: request.projectKey,
    projectPath: request.projectPath,
    payload: {
      projectKey: request.projectKey,
      projectPath: request.projectPath,
      model: request.model,
    },
  });

  try {
    await scheduleOpenClawWorker(run.id, request);
  } catch (err) {
    await updateOrchestrationRun(run.id, {
      state: "error",
      finishedAt: new Date(),
      payload: {
        projectKey: request.projectKey,
        projectPath: request.projectPath,
        error: `Failed to start worker: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
    return NextResponse.json({ error: "Worker failed to start" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    queued: true,
    run: {
      id: run.id,
      state: run.state,
      startedAt: run.startedAt,
    },
    adapter,
    intent,
  });
}
