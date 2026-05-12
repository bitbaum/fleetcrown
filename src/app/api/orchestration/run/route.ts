import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

import { readJsonBody, z } from "@/lib/api/route-helpers";
import { injectIntoTab, shellEscape, getZellijTabs } from "@/lib/zellij";
import { cancelActiveBeaconSessions } from "@/app/api/beacon/route";
import { buildPromptWithSession, resolveEffectiveTab, stateFile, clearHandshakeFiles } from "@/lib/agent-config";
import {
  ORCHESTRATION_ADAPTER_IDS,
  ORCHESTRATION_TASK_INTENT_IDS,
  type AdapterId,
  type OrchestrationTaskIntentId,
  type OrchestrationTaskRequest,
} from "@/lib/orchestration";
import { getAdapterDefinition, getOrchestrationIntent, renderTaskForAdapter } from "@/lib/orchestration";
import { createOrchestrationEvent } from "@/db/queries/orchestration-events";
import { createOrchestrationRun, updateOrchestrationRun } from "@/db/queries/orchestration-runs";
import { insertPromptHistory } from "@/db/queries/prompt-history";
import { upsertProjectState } from "@/db/queries/project-states";
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

  // Resolve zellij alias once — "Cockpit" may run as "Cockpit Claude" in this session.
  const activeTabs = await getZellijTabs();
  const effectiveKey = activeTabs.length > 0
    ? resolveEffectiveTab(request.projectKey, activeTabs)
    : request.projectKey;

  // Claude remains hook-driven via prompt injection into a live tab.
  if (request.adapter === "claude") {
    try {
      const nowS = Math.floor(Date.now() / 1000);
      const prompt = renderTaskForAdapter(request);
      // hard_stop skips session context — inject the bare stop directive, then immediately
      // block auto-continue so stop.sh won't re-open even after Claude goes idle.
      const fullPrompt = request.intent === "hard_stop"
        ? prompt
        : buildPromptWithSession(prompt, request.projectKey);
      injectIntoTab(effectiveKey, fullPrompt);
      cancelActiveBeaconSessions(effectiveKey);
      if (request.intent === "hard_stop") {
        clearHandshakeFiles(effectiveKey);
        fs.writeFileSync(stateFile.sentinel(effectiveKey), "");
        fs.writeFileSync(stateFile.closing(effectiveKey), String(nowS));
        fs.writeFileSync(stateFile.closed(effectiveKey), String(nowS));
      }
      return NextResponse.json({ ok: true, injected: true, adapter: request.adapter, intent: request.intent });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Inject failed: ${message}` }, { status: 500 });
    }
  }

  // Codex has no native stop hook in this environment, so run the task as a
  // one-shot command in the project tab and hand completion back to the same
  // stop-hook bridge Beacon already uses for Claude.
  if (request.adapter === "codex") {
    try {
      const basePrompt = renderTaskForAdapter(request);

      const prompt = buildPromptWithSession(basePrompt, effectiveKey);
      const promptFile = path.join("/tmp", `cockpit-codex-prompt-${randomUUID()}.txt`);
      fs.writeFileSync(promptFile, prompt);

      const nowS = Math.floor(Date.now() / 1000);
      fs.writeFileSync(stateFile.prompt(effectiveKey), JSON.stringify({
        key: request.intent,
        label: intent.name,
        startedAt: nowS,
      }));

      upsertProjectState({
        projectKey: request.projectKey,
        userId,
        tabName: effectiveKey,
        currentPromptKey: request.intent,
        currentPromptLabel: intent.name,
        currentPromptStartedAt: new Date(nowS * 1000),
      }).catch(() => {});

      createOrchestrationEvent({
        userId,
        projectKey: request.projectKey,
        eventType: (request.intent === "close_session" || request.intent === "hard_stop") ? "close_requested" : "continue_requested",
        source: "api-orchestration",
        adapter: "codex",
        intent: request.intent,
        detail: intent.name,
        happenedAt: new Date(nowS * 1000),
      }).catch(() => {});

      createOrchestrationEvent({
        userId,
        projectKey: request.projectKey,
        eventType: "task_started",
        source: "api-orchestration",
        adapter: "codex",
        intent: request.intent,
        detail: intent.name,
        happenedAt: new Date(nowS * 1000),
      }).catch(() => {});

      clearHandshakeFiles(effectiveKey);

      if (request.intent === "hard_stop") {
        fs.writeFileSync(stateFile.sentinel(effectiveKey), "");
        fs.writeFileSync(stateFile.closing(effectiveKey), String(nowS));
        fs.writeFileSync(stateFile.closed(effectiveKey), String(nowS));
      } else if (request.intent === "close_session") {
        fs.writeFileSync(stateFile.sentinel(effectiveKey), "");
        fs.writeFileSync(stateFile.closing(effectiveKey), String(nowS));
      } else {
        try { fs.unlinkSync(stateFile.closing(effectiveKey)); } catch { /* gone */ }
      }

      const runner = path.join(process.cwd(), "scripts", "run-codex-task.sh");
      const command = [
        "bash",
        shellEscape(runner),
        shellEscape(effectiveKey),
        shellEscape(request.projectPath),
        shellEscape(promptFile),
        shellEscape(request.model?.trim() || "gpt-5.4"),
      ].join(" ");

      injectIntoTab(effectiveKey, command);
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
