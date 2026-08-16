import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ORCH_STATE } from "@/lib/orchestration/contract";
import { spawn } from "node:child_process";
import path from "node:path";
import { isRuntimeAvailable } from "@/lib/runtime";
import { deriveProjectStateKey, projectStateDescription } from "@/lib/control-states";

import { readJsonBody, z } from "@/lib/api/route-helpers";
import { injectIntoTab, shellEscape, getZellijTabs } from "@/lib/zellij";
import { AGENT_DEFAULT_MODELS } from "@/lib/agent-registry";
import { cancelActiveBeaconSessions } from "@/app/api/beacon/route";
import { buildPromptWithSession, resolveEffectiveTab, stateFile, clearHandshakeFiles, sessionHandoffContract } from "@/lib/agent-config";
import { FLEET_SESSIONS_DISPLAY_PATH } from "@/lib/session-paths";
import { deriveRunTab } from "@/lib/run-tab";
import {
  ORCHESTRATION_ADAPTER_IDS,
  ORCHESTRATION_TASK_INTENT_IDS,
  type AdapterId,
  type OrchestrationTaskIntentId,
  type OrchestrationTaskRequest,
} from "@/lib/orchestration";
import { getAdapterDefinition, getOrchestrationIntent, renderTaskForAdapter } from "@/lib/orchestration";
import { createOrchestrationEvent } from "@/db/queries/orchestration-events";
import { createOrchestrationRun, updateOrchestrationRun, isProjectBusy } from "@/db/queries/orchestration-runs";
import { insertPromptHistory } from "@/db/queries/prompt-history";
import { consumeProjectPrompt, getProjectState, persistProjectRuntimeIfNewer, prependProjectPrompt } from "@/db/queries/project-states";
import { getApiUserId } from "@/lib/session";
import { getUserProjects, getOrgProjects } from "@/db/queries/user-projects";
import { getProjectContext } from "@/db/queries/project-context";
import { buildOperatorContextSection } from "@/lib/dispatch-operator-context";
import { enqueueDispatchCommand } from "@/db/queries/pending-commands";
import { getRunnerConnected } from "@/db/queries/runner-presence";
import { logDebug } from "@/db/queries/debug-logs";
import { APP_SLUG } from "@/config/brand";
import { writePromptQueueMirror } from "@/lib/prompt-queue-mirror";
import { executionAccessErrorBody, resolveQueuedExecution, projectPreferredChannel } from "@/lib/execution-access";
import { workspaceIdFor } from "@/lib/agent-execution/ownership";

/** Same-project parallel dispatch (phase 2 of worktree-per-agent): when a
 *  project is busy, dispatch immediately under a derived tab alias instead of
 *  queueing behind. Requires worktree isolation on the runner (the runner
 *  force-isolates derived tabs, so this can't create shared-checkout races).
 *  Default off — flip after the worktree flag has been dogfooded. */
const PARALLEL_DISPATCH_ENABLED = process.env.FLEETCROWN_PARALLEL_DISPATCH === "true";

const RunOrchestrationBody = z.object({
  projectId: z.string().uuid().nullable().optional(),
  projectKey: z.string().trim().min(1).max(120),
  // Optional: when omitted (e.g. Loki's loki_dispatch by name), the server
  // resolves projectPath + adapter from the user's project registry.
  projectPath: z.string().trim().min(1).max(500).optional(),
  adapter: z.enum(ORCHESTRATION_ADAPTER_IDS).optional(),
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

  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve projectPath + adapter from the registry when omitted (Loki dispatches
  // by name). Mirrors inject-core's lookup; downstream branches read dataOrResp.
  if (!dataOrResp.projectPath || !dataOrResp.adapter) {
    const all = [
      ...(await getUserProjects(userId).catch(() => [])),
      ...(await getOrgProjects(userId).catch(() => [])),
    ];
    const match = all.find((p) => p.name.toLowerCase() === dataOrResp.projectKey.toLowerCase());
    if (!dataOrResp.projectPath) {
      if (!match?.dirPath) {
        return NextResponse.json(
          { error: `Unknown project "${dataOrResp.projectKey}" (or it has no local path).` },
          { status: 404 },
        );
      }
      dataOrResp.projectPath = match.dirPath;
      dataOrResp.projectId = dataOrResp.projectId ?? match.entityProjectId ?? null;
    }
    if (!dataOrResp.adapter) {
      dataOrResp.adapter = (match?.agentPref as (typeof ORCHESTRATION_ADAPTER_IDS)[number]) ?? "openclaw";
    }
  }

  // status:working gate removed 2026-06-11 (Session 5b of killing-the-bash-
  // runner). Original 2026-05-31 rationale: "even with status:working set,
  // the runner kept getting fresh inject commands" — but the bash runner
  // that motivated this defence-in-depth is gone (Sessions 1-4). The only
  // entry path that still routes through here is manual user clicks on
  // /control intent buttons; gating those was a false positive. A human
  // explicitly clicking Send IS the override signal. The autopilot path
  // (dispatch → dispatch-gates.ts) still respects status:working for
  // auto-fire; manual fires fly through unconditionally.

  if (!isRuntimeAvailable()) {
    // Cloud mode: only the claude adapter can be queued via pending_commands.
    // Other adapters (openclaw, codex, gemini) require local workers/tools.
    const request = dataOrResp as OrchestrationTaskRequest;
    if (!getAdapterDefinition(request.adapter).capabilities.cloudQueueable) {
      return NextResponse.json(
        { error: `${request.adapter} orchestration requires the local runtime — not available in cloud mode` },
        { status: 503 },
      );
    }
    // Project-aware default channel — a dirPath-only project (no cloneable
    // repo) can only execute where its directory exists; pin it to "local"
    // instead of letting the cloud builder invent an empty workspace.
    const registryMatch = [
      ...(await getUserProjects(userId).catch(() => [])),
      ...(await getOrgProjects(userId).catch(() => [])),
    ].find((p) => p.name.toLowerCase() === request.projectKey.toLowerCase());
    const execution = await resolveQueuedExecution(userId, { defaultChannel: projectPreferredChannel(registryMatch) });
    if (!execution.ok) {
      return NextResponse.json(executionAccessErrorBody(execution), { status: execution.status });
    }
    const intent = getOrchestrationIntent(request.intent as OrchestrationTaskIntentId);
    // Aim the agent at the project's roadmap: brief + active goals (getProjectContext).
    request.projectContext = (await getProjectContext(userId, request.projectKey)) ?? undefined;
    // Life-OS half: the operator's top-level goals + near-term deadlines, so this
    // cloud-queued dispatch serves the captain's objectives too (mirrors the
    // inject-prompt/inject-core paths). Best-effort background section.
    const operatorSection = await buildOperatorContextSection(userId).catch(() => "");
    // Exit contract — WITHOUT it a box-executed agent finishes real work, writes
    // no ~/.fleetcrown/sessions/<tab>.md handoff, and gets reaped as a timeout (the
    // same gap inject-prompt.ts:66-74 closes for the inject path). The local
    // orchestration path gets this via buildPromptWithSession; the cloud path —
    // Control's dispatch / Next-best buttons — was the one bypass. Appended here
    // (renderTaskForAdapter does not include it) so every dispatch path lands a
    // handoff. Tilde-relative on purpose: the agent expands HOME, not the server.
    const sessionFileRef = `${FLEET_SESSIONS_DISPLAY_PATH}/${request.projectKey}.md`;
    const prompt = `${[operatorSection, renderTaskForAdapter(request)].filter(Boolean).join("\n\n")}\n\n## Exit contract (operator requirement)\nBefore stopping, create ${sessionFileRef}.\n${sessionHandoffContract(sessionFileRef)}`;
    // Create an orchestration_runs row for trackable intents so the local runner
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
          // The runner has not executed this command yet. Runtime state will
          // show active work only after a successful local injection.
          state: ORCH_STATE.WAITING,
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
    // Enqueue a `dispatch` (not bare `inject`): the runner ensures the tab,
    // launches the agent if none is running, then injects — so "Next best" on
    // an idle project actually starts work instead of typing into the void.
    // Model is forwarded so the runner's auto-launch honors it; when absent the
    // runner's _conf_model_for_tab fallback reads agent-projects.conf.
    const commandId = await enqueueDispatchCommand(userId, {
      tab: request.projectKey,
      ...(execution.channel ? { channel: execution.channel } : {}),
      dir: request.projectPath,
      agent: request.adapter,
      prompt,
      promptKey: request.intent,
      promptLabel: intent.name,
      model: request.model,
      projectKey: request.projectKey,
      runId: cloudRunId ?? undefined,
    });
    return NextResponse.json({
      ok: true, queued: true, mode: "queued", commandId, runId: cloudRunId, runnerConnected: execution.runnerConnected,
      // Fail loud, not silent — a dispatch with no live runner says so.
      ...(execution.runnerConnected === false && {
        warning: "runner-offline",
        message: "Fleet Runner is offline — queued; it will run as soon as the runner reconnects.",
      }),
    });
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
  if (adapter.capabilities.tabInjected && request.intent === "next_best") {
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

  // Aim the agent at the project's roadmap: brief + active goals (getProjectContext).
  request.projectContext = (await getProjectContext(userId, request.projectKey)) ?? undefined;
  // Life-OS half: the operator's top-level goals + near-term deadlines, prepended
  // as a background section so tab-injected and queued-behind dispatches serve the
  // captain's objectives too (mirrors inject-core/inject-prompt). Best-effort.
  const operatorSection = await buildOperatorContextSection(userId).catch(() => "");
  const withOperator = (body: string) => [operatorSection, body].filter(Boolean).join("\n\n");
  // Log every dispatch regardless of adapter — foundation for reuse suggestions and analytics
  const resolvedPromptBody = withOperator(renderTaskForAdapter(request));
  insertPromptHistory(userId, {
    projectId: request.projectId ?? null,
    projectKey: request.projectKey,
    projectPath: request.projectPath,
    adapter: request.adapter as AdapterId,
    intent: request.intent as OrchestrationTaskIntentId,
    customPrompt: request.intent === "custom" ? (request.customInstructions ?? null) : null,
    resolvedPrompt: resolvedPromptBody,
  }).catch((err) => console.error("[orchestration/run] db write failed:", err));

  // Create an orchestration_runs row for tab-injected adapters too — gives every dispatch
  // an outcome to learn from, not just openclaw worker runs. Lifecycle intents (hard_stop /
  // close_session) end sessions and don't produce work outcomes, so they're skipped.
  const TRACKABLE_INTENTS = (request.intent !== "hard_stop" && request.intent !== "close_session");
  const TAB_ADAPTERS = adapter.capabilities.tabInjected;
  let trackedRunId: string | null = null;
  if (TAB_ADAPTERS && TRACKABLE_INTENTS) {
    try {
      const run = await createOrchestrationRun({
        userId,
        projectId: request.projectId ?? null,
        adapter: request.adapter,
        intent: request.intent,
        state: ORCH_STATE.RUNNING,
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

  // Serialize same-project dispatch for tab-injected adapters (claude/codex/
  // gemini/grok) — the ones that share the project's zellij tab + git checkout +
  // /tmp sentinels. If another agent's run is already ahead of ours for this
  // project, queue this dispatch for the runner instead of colliding; it drains
  // FIFO once our run is the oldest open one. TRACKABLE_INTENTS already excludes
  // hard_stop/close_session (which must always fire to interrupt). openclaw is a
  // detached worker (no shared tab/checkout) → not gated. Fail open on DB hiccup.
  if (TAB_ADAPTERS && TRACKABLE_INTENTS
      && (await isProjectBusy(userId, request.projectKey, { excludeRunId: trackedRunId ?? undefined }).catch(() => false))) {
    const runnerConnected = await getRunnerConnected(userId);
    // Same project-aware pinning as the cloud branch: a dirPath-only project
    // must not be claimable by a builder that can't materialize its workspace.
    const busyMatch = [
      ...(await getUserProjects(userId).catch(() => [])),
      ...(await getOrgProjects(userId).catch(() => [])),
    ].find((p) => p.name.toLowerCase() === request.projectKey.toLowerCase());
    const pinnedChannel = projectPreferredChannel(busyMatch);

    // Phase 2 of worktree-per-agent: same-project PARALLEL dispatch. With
    // checkout isolation in place (each run gets its own git worktree), the
    // only reason to queue was the shared tab/session/sentinel identity — so
    // mint this run a derived tab alias (<project>~<runId8>) and every
    // tab-keyed mechanism (PTY workspace, session handoff, sentinels, zellij
    // tab, worktree) composes unchanged. The runner FORCES worktree isolation
    // for derived tabs regardless of its env flag, so parallel-without-
    // isolation is impossible. Run row keeps the BASE projectKey (analytics,
    // busy checks aggregate per project); payload.sessionTab carries the alias
    // for the close path. Opt-in via FLEETCROWN_PARALLEL_DISPATCH.
    if (PARALLEL_DISPATCH_ENABLED && trackedRunId) {
      const runTab = deriveRunTab(request.projectKey, trackedRunId);
      await updateOrchestrationRun(trackedRunId, {
        payload: {
          projectId: request.projectId ?? null,
          projectKey: request.projectKey,
          projectPath: request.projectPath,
          model: request.model,
          sessionTab: runTab,
        },
      }).catch((err) => console.error("[orchestration/run] sessionTab persist failed:", err));
      // The alias gets its own session file — bake the Exit contract with the
      // DERIVED path so the handoff lands where the close path looks for it.
      const sessionFileRef = `${FLEET_SESSIONS_DISPLAY_PATH}/${runTab}.md`;
      const parallelPrompt =
        `${resolvedPromptBody}\n\n## Exit contract (operator requirement)\nBefore stopping, create ${sessionFileRef}.\n${sessionHandoffContract(sessionFileRef)}`;
      const commandId = await enqueueDispatchCommand(userId, {
        tab: runTab,
        channel: pinnedChannel,
        dir: request.projectPath,
        agent: request.adapter,
        prompt: parallelPrompt,
        promptKey: request.intent,
        promptLabel: intent.name,
        model: request.model,
        projectKey: request.projectKey,
        runId: trackedRunId,
      });
      return NextResponse.json({
        ok: true, queued: true, parallel: true, mode: "parallel", tab: runTab, commandId, runId: trackedRunId, runnerConnected,
      });
    }

    const commandId = await enqueueDispatchCommand(userId, {
      tab: request.projectKey,
      channel: pinnedChannel,
      dir: request.projectPath,
      agent: request.adapter,
      prompt: resolvedPromptBody,
      promptKey: request.intent,
      promptLabel: intent.name,
      model: request.model,
      projectKey: request.projectKey,
      runId: trackedRunId ?? undefined,
    });
    return NextResponse.json({
      ok: true, queued: true, queuedBehind: true, mode: "queued", commandId, runId: trackedRunId, runnerConnected,
    });
  }

  // Claude remains hook-driven via prompt injection into a live tab.
  if (request.adapter === "claude") {
    try {
      const nowS = Math.floor(Date.now() / 1000);
      const prompt = withOperator(renderTaskForAdapter(request));
      // Fetch the project's current state so the agent receives the same
      // one-line WHY the human sees on the badge tooltip. Same SSOT
      // (STATE_DEFINITIONS[k].description) — no paraphrasing — so reading
      // /control and reading the prompt feel like one shared truth.
      const projectRow = await getProjectState(userId, request.projectKey).catch(() => null);
      const stateKey = deriveProjectStateKey({
        agentRunning: projectRow?.agentRunning,
        tabOpen: projectRow?.tabOpen,
        sessionStatus: projectRow?.sessionStatus,
        readyAt: projectRow?.readyAt ? Math.floor(projectRow.readyAt.getTime() / 1000) : null,
        lockAt: projectRow?.lockAt ? Math.floor(projectRow.lockAt.getTime() / 1000) : null,
        closingAt: projectRow?.closingAt ? Math.floor(projectRow.closingAt.getTime() / 1000) : null,
        closedAt: projectRow?.closedAt ? Math.floor(projectRow.closedAt.getTime() / 1000) : null,
      });
      const stateDescription = projectStateDescription(stateKey);
      // hard_stop skips session context — inject the bare stop directive, then immediately
      // block auto-continue so stop.sh won't re-open even after Claude goes idle.
      const fullPrompt = request.intent === "hard_stop"
        ? prompt
        : buildPromptWithSession(prompt, request.projectKey, stateDescription);
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
      // Same SSOT description threaded in — see the Claude branch above
      // for the WHY (human and agent share one source of state context).
      const cxgRow = await getProjectState(userId, request.projectKey).catch(() => null);
      const cxgStateKey = deriveProjectStateKey({
        agentRunning: cxgRow?.agentRunning,
        tabOpen: cxgRow?.tabOpen,
        sessionStatus: cxgRow?.sessionStatus,
        readyAt: cxgRow?.readyAt ? Math.floor(cxgRow.readyAt.getTime() / 1000) : null,
        lockAt: cxgRow?.lockAt ? Math.floor(cxgRow.lockAt.getTime() / 1000) : null,
        closingAt: cxgRow?.closingAt ? Math.floor(cxgRow.closingAt.getTime() / 1000) : null,
        closedAt: cxgRow?.closedAt ? Math.floor(cxgRow.closedAt.getTime() / 1000) : null,
      });
      const prompt = buildPromptWithSession(basePrompt, effectiveKey, projectStateDescription(cxgStateKey));
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
        workspaceId: workspaceIdFor(userId, request.projectKey),
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
    state: ORCH_STATE.RUNNING,
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
      state: ORCH_STATE.ERROR,
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
