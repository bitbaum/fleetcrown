import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { enqueueInjectCommand, enqueueDispatchCommand } from "@/db/queries/pending-commands";
import { getUserProjects } from "@/db/queries/user-projects";
import { getApiUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { executor } from "@/lib/agent-execution";
import { workspaceIdFor } from "@/lib/agent-execution/ownership";
import { assembleInjectPrompt } from "@/lib/inject-prompt";
import { executionAccessErrorBody, resolveQueuedExecution, projectPreferredChannel } from "@/lib/execution-access";
import {
  DEFAULT_ADAPTER_ID,
  ORCHESTRATION_ADAPTER_IDS,
  ORCH_STATE,
  type AdapterId,
} from "@/lib/orchestration";
import { insertPromptHistory } from "@/db/queries/prompt-history";
import { createOrchestrationRun } from "@/db/queries/orchestration-runs";
import { createOrchestrationEvent } from "@/db/queries/orchestration-events";
import { emitRunEvent } from "@/db/queries/run-events";
import type { UserProject } from "@/db/schema";

const Body = z.object({
  tab: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(4000),
});

// Every successful tab-inject dispatch enters the same activity ledger as
// /api/inject (prompt_history + tracked run + orchestration event). Without
// this, work dispatched from the terminal composer / "Send to terminal" was
// invisible in Activity, Control's timeline, recent prompts, and digests —
// the ledger only knew dispatches routed through inject-core. The run is
// closed later by the control poll when the agent's session handoff reports
// ready (closeRunFromSession), identical to inject-core-opened runs.
async function recordTabDispatch(opts: {
  userId: string;
  tab: string;
  project: UserProject | undefined;
  adapter: AdapterId;
  customPrompt: string;
  resolvedPrompt: string;
  promptLabel: string;
}): Promise<string | null> {
  const { userId, tab, project, adapter } = opts;
  const projectId = project?.entityProjectId ?? null;
  const projectKey = project?.name ?? tab;
  const projectPath = project?.dirPath ?? "";

  let runId: string | null = null;
  // A tracked run needs a real project directory for the close signal to find
  // it; a tab with no registered project still gets a prompt_history row so
  // the dispatch is at least auditable.
  if (project?.dirPath) {
    try {
      const run = await createOrchestrationRun({
        userId,
        projectId,
        adapter,
        intent: "custom",
        state: ORCH_STATE.WAITING,
        projectKey,
        projectPath,
        payload: { projectId, projectKey, projectPath },
      });
      runId = run.id;
      void emitRunEvent(run.id, userId, "dispatched", {
        intent: "custom",
        projectKey,
        promptLabel: opts.promptLabel,
      });
    } catch (err) {
      console.error("[tab-inject] tracked-run create failed:", err);
    }
  }

  insertPromptHistory(userId, {
    projectId,
    projectKey,
    projectPath,
    adapter,
    intent: "custom",
    customPrompt: opts.customPrompt,
    resolvedPrompt: opts.resolvedPrompt,
  }).catch((err) => console.error("[tab-inject] db write failed:", err));

  createOrchestrationEvent({
    userId,
    projectId,
    projectKey,
    eventType: "continue_requested",
    source: "api-tab-inject",
    adapter,
    intent: "custom",
    detail: opts.promptLabel,
    happenedAt: new Date(),
  }).catch((err) => console.error("[tab-inject] db write failed:", err));

  return runId;
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { tab, prompt } = dataOrResp;
  const projects = await getUserProjects(userId);
  const project = projects.find((p) => p.name.toLowerCase() === tab.toLowerCase());
  const adapter: AdapterId =
    project?.agentPref && (ORCHESTRATION_ADAPTER_IDS as readonly string[]).includes(project.agentPref)
      ? project.agentPref as AdapterId
      : DEFAULT_ADAPTER_ID;
  const assembled = project?.dirPath
    ? await assembleInjectPrompt({
        userId,
        projectKey: project.name,
        projectPath: project.dirPath,
        projectId: project.entityProjectId ?? null,
        adapter,
        customPrompt: prompt,
        model: project.modelPref ?? undefined,
      })
    : null;
  const promptToSend = assembled?.ok ? assembled.prompt : prompt;
  const promptLabel = assembled?.ok ? assembled.promptLabel : prompt.slice(0, 40);

  // A FleetCrown-owned PTY agent is driven directly via the executor — no zellij.
  const wsId = workspaceIdFor(userId, tab);
  const wsHandle = isRuntimeAvailable() ? executor.get(wsId) : null;
  if (wsHandle && wsHandle.status !== "exited") {
    const { stateFile, clearHandshakeFiles } = await import("@/lib/agent-config");
    const fs = await import("fs");
    const nowS = Math.floor(Date.now() / 1000);
    fs.writeFileSync(stateFile.prompt(tab), JSON.stringify({
      key: "custom", label: promptLabel, startedAt: nowS, source: "inject", adapter,
    }));
    clearHandshakeFiles(tab);
    executor.write(wsId, promptToSend.endsWith("\r") ? promptToSend : `${promptToSend}\r`);
    const runId = await recordTabDispatch({
      userId, tab, project, adapter,
      customPrompt: prompt, resolvedPrompt: promptToSend, promptLabel,
    });
    return NextResponse.json({ ok: true, mode: "pty", tab, ...(runId ? { runId } : {}) });
  }

  if (isRuntimeAvailable()) {
    const [{ injectIntoTab, isUserTypingInTab }, { stateFile, clearHandshakeFiles }, fs] = await Promise.all([
      import("@/lib/zellij"),
      import("@/lib/agent-config"),
      import("fs"),
    ]);
    if (isUserTypingInTab(tab)) {
      return NextResponse.json({ ok: true, blocked: true, reason: "user-typing", tab });
    }
    const nowS = Math.floor(Date.now() / 1000);
    fs.writeFileSync(stateFile.prompt(tab), JSON.stringify({
      key: "custom",
      label: promptLabel,
      startedAt: nowS,
      source: "inject",
      adapter,
    }));
    clearHandshakeFiles(tab);
    injectIntoTab(tab, promptToSend);
    const runId = await recordTabDispatch({
      userId, tab, project, adapter,
      customPrompt: prompt, resolvedPrompt: promptToSend, promptLabel,
    });
    return NextResponse.json({ ok: true, mode: "direct", tab, ...(runId ? { runId } : {}) });
  }

  // Cloud mode: prefer the self-healing `dispatch` command (ensure tab → launch
  // agent if none is running → inject → verify) over a bare `inject`, which
  // silently no-ops — and surfaces "tab not found" — when the tab's agent has
  // exited or its zellij tab vanished. That no-op was the failure that broke the
  // loop. Resolve the project's dir + agent so the runner can recover the tab.
  // Fall back to bare inject only when the project/dir is unknown.
  // Project-aware default: a dirPath-only project (no cloneable repo) can only
  // execute where the directory exists — pin it to the local runner instead of
  // letting the cloud builder invent an empty workspace (BiasLens, 2026-07-14).
  const execution = await resolveQueuedExecution(userId, { defaultChannel: projectPreferredChannel(project, "cloud") });
  if (!execution.ok) {
    return NextResponse.json(executionAccessErrorBody(execution), { status: execution.status });
  }
  // Record BEFORE enqueue so the command payload carries the runId — the
  // runner's ack (submitted/delivered/undelivered) and the queued-dispatch
  // ordering machinery both key on payload.runId.
  const runId = await recordTabDispatch({
    userId, tab, project, adapter,
    customPrompt: prompt, resolvedPrompt: promptToSend, promptLabel,
  });
  if (project?.dirPath) {
    const commandId = await enqueueDispatchCommand(userId, {
      tab,
      ...(execution.channel ? { channel: execution.channel } : {}),
      dir: project.dirPath,
      agent: adapter,
      prompt: promptToSend,
      promptLabel,
      model: project.modelPref ?? undefined,
      projectKey: tab,
      ...(runId ? { runId } : {}),
    });
    return NextResponse.json({ ok: true, mode: "dispatch", commandId, tab, ...(runId ? { runId } : {}) });
  }

  const commandId = await enqueueInjectCommand(userId, {
    tab,
    ...(execution.channel ? { channel: execution.channel } : {}),
    prompt: promptToSend,
    promptKey: "",
    promptLabel,
    adapter,
    ...(runId ? { runId } : {}),
  });
  return NextResponse.json({ ok: true, mode: "queued", commandId, tab, ...(runId ? { runId } : {}) });
}
