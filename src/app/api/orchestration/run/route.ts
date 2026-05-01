import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { injectIntoTab } from "@/lib/zellij";
import { DEFAULT_USER_ID } from "@/lib/constants";
import type { AdapterId, OrchestrationTaskIntentId, OrchestrationTaskRequest } from "@/lib/orchestration";
import { getAdapterDefinition, getOrchestrationIntent, renderTaskForAdapter } from "@/lib/orchestration";
import { createOrchestrationRun } from "@/db/queries/orchestration-runs";
import { insertPromptHistory } from "@/db/queries/prompt-history";

const RunOrchestrationBody = z.object({
  projectKey: z.string().trim().min(1).max(120),
  projectPath: z.string().trim().min(1).max(500),
  adapter: z.enum(["claude", "codex", "openclaw", "gemini"]).default("openclaw"),
  intent: z.enum([
    "next_best",
    "test_and_fix",
    "quality",
    "full_audit",
    "product",
    "ux_review",
    "deploy_check",
    "commit_push",
    "close_session",
    "continue",
    "custom",
  ]),
  model: z.string().trim().max(160).optional(),
  customInstructions: z.string().trim().max(4000).optional(),
});

function scheduleOpenClawWorker(runId: string, request: OrchestrationTaskRequest) {
  const workerPath = path.join(process.cwd(), "scripts", "run-openclaw-orchestration.ts");
  const payload = Buffer.from(JSON.stringify({ runId, request }), "utf8").toString("base64url");
  const command = `cd ${JSON.stringify(process.cwd())} && set -a && source .env.local >/dev/null 2>&1 && npx tsx ${JSON.stringify(workerPath)} ${JSON.stringify(payload)}`;
  const child = spawn("bash", ["-lc", command], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, RunOrchestrationBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const request: OrchestrationTaskRequest = dataOrResp as OrchestrationTaskRequest;
  const adapter = getAdapterDefinition(request.adapter as AdapterId);
  const intent = getOrchestrationIntent(request.intent as OrchestrationTaskIntentId);

  // Log every dispatch regardless of adapter — foundation for reuse suggestions and analytics
  insertPromptHistory({
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
      injectIntoTab(request.projectKey, prompt);
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
    userId: DEFAULT_USER_ID,
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

  scheduleOpenClawWorker(run.id, request);

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
