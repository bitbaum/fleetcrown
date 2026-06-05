import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { isRuntimeAvailable } from "@/lib/runtime";

import { readJsonBody, z } from "@/lib/api/route-helpers";
import { injectIntoTab, shellEscape, getZellijTabs } from "@/lib/zellij";
import { AGENT_DEFAULT_MODELS } from "@/lib/agent-registry";
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
import { consumeProjectPrompt, getProjectState, persistProjectRuntimeIfNewer, prependProjectPrompt } from "@/db/queries/project-states";
import { getSessionUserId } from "@/lib/session";
import { enqueueInjectCommand } from "@/db/queries/pending-commands";
import { logDebug } from "@/db/queries/debug-logs";
import { APP_SLUG } from "@/config/brand";
import { writePromptQueueMirror } from "@/lib/prompt-queue-mirror";

const RunOrchestrationBody = z.object({
  projectId: z.string().uuid().nullable().optional(),
  projectKey: z.string().trim().min(1).max(120),
  projectPath: z.string().trim().min(1).max(500),
  adapter: z.enum(ORCHESTRATION_ADAPTER_IDS).default("openclaw"),
  intent: z.enum(ORCHESTRATION_TASK_INTENT_IDS),
  model: z.string().trim().max(160).optional(),
  customInstructions: z.string().trim().max(4000).optional(),
  // Optional database-backed queue snapshot from the client. Plumbed into
  // the prompt body via renderTaskForAdapter so the agent
  // can weigh queue items against other candidates. Max 200 items × 4kB
  // matches the persistence limit in /api/beacon/queue/[tab].
  queue: z.array(z.string().max(4000)).max(200).optional(),
});

async function scheduleOpenClawWorker(runId: string, userId: string, request: OrchestrationTaskRequest) {
  const workerPath = path.join(process.cwd(), "scripts", "run-openclaw-orchestration.ts");
  // userId in the payload so the worker can emit task_completed/task_failed
  // to orchestration_events (user_id is NOT NULL on that table).
  const payload = Buffer.from(JSON.stringify({ runId, userId, request }), "utf8").toString("base64url");
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

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Cross-path autopilot gate (added 2026-05-31). The dispatch route's gates
  // (b89fdfc) covered the watchdog path but missed this one — /api/orchestration/run
  // is what enqueues pending_commands for the daemon, and it had no status check.
  // Result: even with status:working set, the daemon kept getting fresh inject
  // commands. Block here for non-lifecycle intents when the cached session state
  // says working — daemon-side execute_inject also refuses (defence-in-depth)
  // but blocking here saves a database write and a queue trip. hard_stop and
  // close_session always go through (lifecycle kill switches must not be gated).
  const liveIntent = (dataOrResp as OrchestrationTaskRequest).intent;
  const liveProjectKey = (dataOrResp as OrchestrationTaskRequest).projectKey;
  if (liveIntent !== "hard_stop" && liveIntent !== "close_session") {
    const cached = await getProjectState(userId, liveProjectKey).catch(() => null);
    if (cached?.sessionStatus === "working") {
      return NextResponse.json({
        error: "agent-status-working",
        reason: "Your session handoff says status:working — autopilot is paused. Clear status to dispatch.",
      }, { status: 409 });
    }
  }

  if (!isRuntimeAvailable()) {
    // Cloud mode: only the claude adapter can be queued via pending_commands.
    // Other adapters (openclaw, codex, gemini) require local workers/tools.
    const request = dataOrResp as OrchestrationTaskRequest;
    if (request.adapter !== "claude") {
      return NextResponse.json(
        { error: `${request.adapter} orchestration requires the local runtime — not available in cloud mode` },
        { status: 503 },
      );
    }
    const intent = getOrchestrationIntent(request.intent as OrchestrationTaskIntentId);
    const prompt = renderTaskForAdapter(request);
    // Create an orchestration_runs row for trackable intents so the local daemon
    // can write /tmp/cockpit-run-<tab> and agent-hook-bridge.sh can close out the
    // outcome when the agent session ends. Lifecycle intents (hard_stop /
    // close_session) end sessions and don't produce work outcomes — skip tracking.
    let cloudRunId: string | null = null;
    if (request.intent !== "hard_stop" && request.intent !== "close_session") {
      try {
        const run = await createOrchestrationRun({
          userId,
          projectId: request.projectId ?? null,
          adapter: request.adapter,
          intent: request.intent,
          // The daemon has not executed this command yet. Runtime state will
          // show active work only after a successful local injection.
          state: "waiting",
          projectKey: request.projectKey,
          projectPath: request.projectPath,
          payload: {
            projectId: request.projectId ?? null,
            projectKey: request.projectKey,
            projectPath: request.projectPath,
            model: request.model,
          },
        });
        cloudRunId = run.id;
      } catch (err) {
        console.error("[orchestration/run] cloud tracked-run create failed:", err);
        // Non-fatal — dispatch still proceeds without outcome tracking.
      }
    }
    const commandId = await enqueueInjectCommand(userId, {
      tab: request.projectKey,
      prompt,
      promptKey: request.intent,
      promptLabel: intent.name,
      adapter: request.adapter,
      // Forward caller-supplied model so the daemon's auto-launch (501a6e7)
      // honors it. When absent, the daemon's _conf_model_for_tab fallback
      // (9a3bd61) reads agent-projects.conf, which is synced from
      // user_projects.modelPref on a 5-minute cycle. No DB lookup needed
      // here — the daemon already covers the implicit-pref path.
      model: request.model,
      projectId: request.projectId ?? null,
      projectKey: request.projectKey,
      runId: cloudRunId ?? undefined,
    });
    return NextResponse.json({ ok: true, queued: true, mode: "queued", commandId, runId: cloudRunId });
  }
  const request: OrchestrationTaskRequest = dataOrResp as OrchestrationTaskRequest;
  const adapter = getAdapterDefinition(request.adapter as AdapterId);
  let intent = getOrchestrationIntent(request.intent as OrchestrationTaskIntentId);
  let consumedQueueItem: string | null = null;

  // Resolve zellij alias once — "FleetCrown" may run as "FleetCrown Claude" in this session.
  const activeTabs = await getZellijTabs();
  const effectiveKey = activeTabs.length > 0
    ? resolveEffectiveTab(request.projectKey, activeTabs)
    : request.projectKey;

  // For tab-injected adapters: prioritize the prompt queue for next_best intent.
  // openclaw uses a worker process, not tab injection, so it does not participate in the queue.
  // This matches the stop-hook behavior and prevents AI-generated plans from superseding
  // user-defined queue items during auto-fire or manual 'Next best' clicks.
  // Health gate mirrors sessionHealthBlocksQueue() on the client: if session health is critical
  // or tests are failing, skip queue pop so the agent picks the recovery task instead.
  if (request.adapter !== "openclaw" && request.intent === "next_best") {
    const projectState = await getProjectState(userId, request.projectKey).catch(() => null);
    const healthBlocks = (projectState?.sessionHealth ?? "").toLowerCase().includes("critical")
      || (projectState?.sessionTests ?? "").toLowerCase().includes("fail");

    if (!healthBlocks) {
      const first = projectState?.promptQueue[0];
      if (first) {
        const consumed = await consumeProjectPrompt(userId, request.projectKey, first).catch(() => null);
        if (consumed?.consumed) {
          writePromptQueueMirror(effectiveKey, consumed.queue);
          request.intent = "custom";
          request.customInstructions = first;
          intent = getOrchestrationIntent("custom");
          consumedQueueItem = first;
        }
      }
    }
  }

  const restoreConsumedQueueItem = async () => {
    if (!consumedQueueItem) return;
    const restored = await prependProjectPrompt(userId, request.projectKey, effectiveKey, consumedQueueItem).catch(() => null);
    if (restored?.applied) writePromptQueueMirror(effectiveKey, restored.queue);
  };

  // Log every dispatch regardless of adapter — foundation for reuse suggestions and analytics
  insertPromptHistory(userId, {
    projectId: request.projectId ?? null,
    projectKey: request.projectKey,
    projectPath: request.projectPath,
    adapter: request.adapter as AdapterId,
    intent: request.intent as OrchestrationTaskIntentId,
    customPrompt: request.intent === "custom" ? (request.customInstructions ?? null) : null,
  }).catch((err) => console.error("[orchestration/run] db write failed:", err));

  // Create an orchestration_runs row for tab-injected adapters too — gives every dispatch
  // an outcome to learn from, not just openclaw worker runs. Lifecycle intents (hard_stop /
  // close_session) end sessions and don't produce work outcomes, so they're skipped.
  const TRACKABLE_INTENTS = (request.intent !== "hard_stop" && request.intent !== "close_session");
  const TAB_ADAPTERS = (request.adapter === "claude" || request.adapter === "codex" || request.adapter === "gemini" || request.adapter === "grok");
  let trackedRunId: string | null = null;
  if (TAB_ADAPTERS && TRACKABLE_INTENTS) {
    try {
      const run = await createOrchestrationRun({
        userId,
        projectId: request.projectId ?? null,
        adapter: request.adapter,
        intent: request.intent,
        state: "running",
        projectKey: request.projectKey,
        projectPath: request.projectPath,
        payload: {
          projectId: request.projectId ?? null,
          projectKey: request.projectKey,
          projectPath: request.projectPath,
          model: request.model,
        },
      });
      trackedRunId = run.id;
      // Sentinel read by scripts/agent-hook-bridge.sh:handle_stop to call the finish endpoint
      // with the captured outcome once the agent ends its session.
      fs.writeFileSync(stateFile.run(effectiveKey), trackedRunId);
    } catch (err) {
      console.error("[orchestration/run] tracked run create failed:", err);
      // Non-fatal — dispatch still proceeds without outcome tracking for this run.
    }
  }

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
      await cancelActiveBeaconSessions(userId, effectiveKey);
      clearHandshakeFiles(effectiveKey);
      if (request.intent === "hard_stop") {
        fs.writeFileSync(stateFile.sentinel(effectiveKey), "");
        fs.writeFileSync(stateFile.closing(effectiveKey), String(nowS));
        fs.writeFileSync(stateFile.closed(effectiveKey), String(nowS));
      } else if (request.intent === "close_session") {
        // Sentinel tells the stop hook to write closedAt (not readyAt) when the session ends.
        // Mirrors the same logic in /api/inject for close_session.
        fs.writeFileSync(stateFile.sentinel(effectiveKey), "");
        fs.writeFileSync(stateFile.closing(effectiveKey), String(nowS));
      } else {
        // Write current-prompt so the UI shows the running banner.
        // Mirrors the codex/gemini adapter paths and the inject route.
        // Excluded for lifecycle intents (hard_stop/close_session) which end sessions.
        fs.writeFileSync(stateFile.prompt(effectiveKey), JSON.stringify({
          key: request.intent,
          label: intent.name,
          startedAt: nowS,
          source: "run",
          adapter: "claude",
        }));
        // Clear any stale closing sentinel so the UI doesn't stay in "Closing…" state
        // if the user re-dispatches after a close_session was sent but not yet completed.
        // Mirrors the same guard in the inject route and the codex/gemini adapter path.
        try { fs.unlinkSync(stateFile.closing(effectiveKey)); } catch { /* already gone */ }
      }
      return NextResponse.json({ ok: true, injected: true, adapter: request.adapter, intent: request.intent });
    } catch (err) {
      await restoreConsumedQueueItem();
      const message = err instanceof Error ? err.message : String(err);
      logDebug({
        source: "api/orchestration/run",
        level: "error",
        message: `claude inject failed: ${message}`,
        meta: { userId, adapter: request.adapter, intent: request.intent, projectKey: request.projectKey, projectPath: request.projectPath },
      });
      return NextResponse.json({ error: `Inject failed: ${message}` }, { status: 500 });
    }
  }

  // Codex and Gemini have no native stop hook in this environment, so run the task as a
  // one-shot command in the project tab and hand completion back to the same
  // stop-hook bridge Beacon already uses for Claude.
  if (request.adapter === "codex" || request.adapter === "gemini") {
    try {
      const basePrompt = renderTaskForAdapter(request);

      const prompt = buildPromptWithSession(basePrompt, effectiveKey);
      const promptFile = path.join("/tmp", `${APP_SLUG}-${request.adapter}-prompt-${randomUUID()}.txt`);
      fs.writeFileSync(promptFile, prompt);

      const nowS = Math.floor(Date.now() / 1000);
      fs.writeFileSync(stateFile.prompt(effectiveKey), JSON.stringify({
        key: request.intent,
        label: intent.name,
        startedAt: nowS,
        source: "runner",
        adapter: request.adapter,
      }));

      createOrchestrationEvent({
        userId,
        projectId: request.projectId ?? null,
        projectKey: request.projectKey,
        eventType: (request.intent === "close_session" || request.intent === "hard_stop") ? "close_requested" : "continue_requested",
        source: "api-orchestration",
        adapter: request.adapter,
        intent: request.intent,
        detail: intent.name,
        happenedAt: new Date(nowS * 1000),
      }).catch((err) => console.error("[orchestration/run] db write failed:", err));

      createOrchestrationEvent({
        userId,
        projectId: request.projectId ?? null,
        projectKey: request.projectKey,
        eventType: "task_started",
        source: "api-orchestration",
        adapter: request.adapter,
        intent: request.intent,
        detail: intent.name,
        happenedAt: new Date(nowS * 1000),
      }).catch((err) => console.error("[orchestration/run] db write failed:", err));

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

      const runner = path.join(process.cwd(), "scripts", request.adapter === "gemini" ? "run-gemini-task.sh" : "run-codex-task.sh");
      const command = [
        "bash",
        shellEscape(runner),
        shellEscape(effectiveKey),
        shellEscape(request.projectPath),
        shellEscape(promptFile),
        shellEscape(request.model?.trim() || (request.adapter === "gemini" ? AGENT_DEFAULT_MODELS.gemini : AGENT_DEFAULT_MODELS.codex)),
      ].join(" ");

      injectIntoTab(effectiveKey, command);
      persistProjectRuntimeIfNewer({
        projectKey: request.projectKey,
        projectId: request.projectId ?? null,
        userId,
        tabName: effectiveKey,
        runtimeObservedAt: new Date(),
        currentPromptKey: request.intent,
        currentPromptLabel: intent.name,
        currentPromptStartedAt: new Date(nowS * 1000),
      }).catch((err) => console.error("[orchestration/run] db write failed:", err));
      return NextResponse.json({ ok: true, injected: true, adapter: request.adapter, intent: request.intent });
    } catch (err) {
      await restoreConsumedQueueItem();
      try { fs.unlinkSync(stateFile.prompt(effectiveKey)); } catch { /* absent */ }
      const message = err instanceof Error ? err.message : String(err);
      logDebug({
        source: "api/orchestration/run",
        level: "error",
        message: `${request.adapter} inject failed: ${message}`,
        meta: { userId, adapter: request.adapter, intent: request.intent, projectKey: request.projectKey, projectPath: request.projectPath },
      });
      // Close the started/failed pair — task_started was emitted at line ~296
      // before injectIntoTab; if that throws, record the failed counterpart
      // here so orchestration_events doesn't carry an orphan start.
      createOrchestrationEvent({
        userId,
        projectId: request.projectId ?? null,
        projectKey: request.projectKey,
        eventType: "task_failed",
        source: "api-orchestration",
        adapter: request.adapter,
        intent: request.intent,
        detail: `${intent.name}: ${message}`.slice(0, 400),
        happenedAt: new Date(),
      }).catch((e) => console.error("[orchestration/run] task_failed write failed:", e));
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
    projectId: request.projectId ?? null,
    adapter: request.adapter,
    intent: request.intent,
    state: "running",
    projectKey: request.projectKey,
    projectPath: request.projectPath,
    payload: {
      projectId: request.projectId ?? null,
      projectKey: request.projectKey,
      projectPath: request.projectPath,
      model: request.model,
    },
  });

  // Emit task_started for openclaw too — until now this branch had no
  // lifecycle event of any kind on success (the codex/gemini branch at
  // line ~296 emits task_started but this branch skipped it), so every
  // successful openclaw run was invisible in orchestration_events. The
  // matching task_completed/task_failed is emitted by the worker script.
  createOrchestrationEvent({
    userId,
    projectId: request.projectId ?? null,
    projectKey: request.projectKey,
    eventType: "task_started",
    source: "api-orchestration",
    adapter: request.adapter,
    intent: request.intent,
    detail: intent.name,
    happenedAt: new Date(),
  }).catch((e) => console.error("[orchestration/run] task_started write failed:", e));

  try {
    await scheduleOpenClawWorker(run.id, userId, request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateOrchestrationRun(run.id, {
      state: "error",
      outcome: "error",
      finishedAt: new Date(),
      payload: {
        projectId: request.projectId ?? null,
        projectKey: request.projectKey,
        projectPath: request.projectPath,
        error: `Failed to start worker: ${message}`,
      },
    });
    logDebug({
      source: "api/orchestration/run",
      level: "error",
      message: `openclaw worker start failed: ${message}`,
      meta: { userId, runId: run.id, adapter: request.adapter, intent: request.intent, projectKey: request.projectKey, projectPath: request.projectPath },
    });
    // Worker never started → the orchestration_runs row was just marked
    // outcome:'error' above, but orchestration_events still had nothing
    // for the openclaw failure path. Emit task_failed so the dispatch-
    // outcome timeline shows the attempt regardless of which adapter
    // failed.
    createOrchestrationEvent({
      userId,
      projectId: request.projectId ?? null,
      projectKey: request.projectKey,
      eventType: "task_failed",
      source: "api-orchestration",
      adapter: request.adapter,
      intent: request.intent,
      // Canonical shape: "<intent_or_label>: <error>" — matches the other
      // task_failed emit sites so downstream queries don't need to parse
      // multiple separator formats. Source field 'api-orchestration' already
      // carries the "openclaw worker start failed" context.
      detail: `${intent.name}: ${message}`.slice(0, 400),
      happenedAt: new Date(),
    }).catch((e) => console.error("[orchestration/run] task_failed write failed:", e));
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
