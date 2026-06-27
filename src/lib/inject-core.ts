/**
 * Inject core — SSOT for dispatching a prompt into a project's agent session.
 *
 * Extracted verbatim from the /api/inject route so server-side callers (the
 * Loki messages route) can dispatch WITHOUT a self-HTTP round-trip. Behavior is
 * identical to the route: it returns `{ status, body }` where the route used to
 * return `NextResponse.json(body, { status })`. The route stays the thin
 * boundary (body parse + auth + the 401 log); everything after auth lives here.
 *
 * This path is autopilot-critical — keep it behavior-preserving.
 */
import { ensureUserProjectEntityLinks, getOrgProjects } from "@/db/queries/user-projects";
import { ORCHESTRATION_ADAPTER_IDS, ORCHESTRATION_TASK_INTENT_IDS, DEFAULT_ADAPTER_ID, renderProjectContextBlock, type OrchestrationTaskIntentId } from "@/lib/orchestration";
import { getProjectContext } from "@/db/queries/project-context";
import { isRuntimeAvailable } from "@/lib/runtime";
import { executor } from "@/lib/agent-execution";
import { workspaceIdFor } from "@/lib/agent-execution/ownership";
import { executeInject } from "@/lib/executor";
import { createOrchestrationEvent } from "@/db/queries/orchestration-events";
import { createOrchestrationRun, isProjectBusy } from "@/db/queries/orchestration-runs";
import { insertPromptHistory } from "@/db/queries/prompt-history";
import { getProjectState, persistProjectRuntimeIfNewer } from "@/db/queries/project-states";
import { deriveProjectStateKey, projectStateDescription } from "@/lib/control-states";
import { logDebug } from "@/db/queries/debug-logs";
import { promptFingerprint, recordControlAuditEvent } from "@/db/queries/control-audit-events";
import { enqueueHostedDispatchCommand } from "@/db/queries/pending-commands";
import { retrieveFleetContextBlock } from "@/db/queries/knowledge-embeddings";
import { assembleInjectPrompt } from "@/lib/inject-prompt";

type ResolvedAdapter = (typeof ORCHESTRATION_ADAPTER_IDS)[number];

export type InjectParams = {
  tab: string;
  promptKey?: string;
  customPrompt?: string;
  adapter?: ResolvedAdapter;
  /** Per-dispatch model override (e.g. Loki's composer model picker). Wins over
   *  the project's stored modelPref; the runner reads it on auto-launch. */
  model?: string;
  runId?: string;
};

export type InjectResult = { status: number; body: Record<string, unknown> };

/**
 * Resolve the target project, build the prompt, and dispatch it (direct local
 * inject or queued for the Fleet Runner). Returns the same payload/status the
 * /api/inject route returns. `userId` is already authenticated by the caller.
 */
export async function injectPrompt(params: InjectParams, userId: string): Promise<InjectResult> {
  const { tab, promptKey, customPrompt, adapter } = params;
  let runId = params.runId;
  // Provisional adapter for early-return logging; the real resolution happens
  // after we've looked up dbMatch and can honor user_projects.agent_pref below.
  let eventAdapter: ResolvedAdapter = adapter ?? DEFAULT_ADAPTER_ID;

  // Resolve canonical tab name and project path — own projects first, then org team projects.
  const [dbProjects, dbTeamProjects] = await Promise.all([
    ensureUserProjectEntityLinks(userId).catch(() => []),
    getOrgProjects(userId).catch(() => []),
  ]);
  const dbMatch =
    dbProjects.find((p) => p.name.toLowerCase() === tab.toLowerCase()) ??
    dbTeamProjects.find((p) => p.name.toLowerCase() === tab.toLowerCase());
  if (!dbMatch) {
    logDebug({
      source: "api/inject",
      level: "warn",
      message: `Unknown tab: ${tab}`,
      meta: { userId, tab, hasPromptKey: !!promptKey, hasCustomPrompt: !!customPrompt },
    });
    recordControlAuditEvent({
      userId,
      projectKey: tab,
      tabName: tab,
      event: "inject_request",
      source: "api/inject",
      action: "refused",
      reason: "Unknown tab",
      queueLength: null,
      blockerCount: null,
      promptHash: null,
      promptPreview: customPrompt?.slice(0, 220) ?? promptKey ?? null,
      meta: { hasPromptKey: !!promptKey, hasCustomPrompt: !!customPrompt },
    });
    return { status: 404, body: { error: `Unknown tab: ${tab}` } };
  }

  const canonical = dbMatch.name;
  const projectPath: string | null = dbMatch.dirPath ?? null;
  const projectId: string | null = dbMatch.entityProjectId ?? null;

  // Is this project backed by a live FleetCrown-owned PTY (server-side launch)?
  // The executor registry is the SSOT — a live handle means we drive the agent's
  // stdin directly and bypass every zellij concept (tab resolution, focus-dance,
  // the zsh user-typing hook). No live workspace → fall back to the legacy zellij
  // path unchanged (cloud mode never has one; injectFn is null there).
  const ptyWorkspaceId = workspaceIdFor(userId, canonical);
  const ptyHandle = isRuntimeAvailable() ? executor.get(ptyWorkspaceId) : null;
  const ptyBacked = !!ptyHandle && ptyHandle.status !== "exited";

  // Honor the project's per-row agent preference when the caller didn't pin one.
  // Without this the runner defaults to "claude" for every project regardless
  // of agent_pref, so a Gemini project gets a Claude launch and a Cursor
  // project gets Claude too. The DB column is text, so validate it's still a
  // supported adapter before trusting it.
  if (!adapter && dbMatch.agentPref) {
    const ids = ORCHESTRATION_ADAPTER_IDS as readonly string[];
    if (ids.includes(dbMatch.agentPref)) {
      eventAdapter = dbMatch.agentPref as ResolvedAdapter;
    }
  }

  // Model override: a caller-supplied model (Loki's composer model picker) wins
  // over the project's stored modelPref. The runner's execute_inject auto-launch
  // reads payload.model and prefers it over the conf-file model, so a project
  // pinned to "opus" launches Claude with opus and a one-off dispatch pinned to
  // "gpt-5" gets gpt-5 instead of the runner's hardcoded gpt-5.4 default.
  const eventModel = params.model?.trim() || dbMatch.modelPref?.trim() || undefined;

  let prompt: string;
  let promptLabel = "Custom";
  let effectiveTab = canonical;

  if (isRuntimeAvailable()) {
    // Local: resolve live zellij tab and build prompt with session context.
    // These imports call execSync / read /tmp files — only safe locally.
    const { resolveEffectiveTab, readPrompts, readPromptMeta, getZellijTabs } =
      await import("@/lib/agent-config").then(async (m) => ({
        ...m,
        getZellijTabs: (await import("@/lib/zellij")).getZellijTabs,
      }));

    // PTY-backed agents have no zellij tab — effectiveTab stays canonical and we
    // skip the "is the tab open in zellij" gate entirely.
    if (!ptyBacked) {
      const activeTabs = await getZellijTabs();
      if (activeTabs.length > 0) {
        effectiveTab = resolveEffectiveTab(canonical, activeTabs);
        if (effectiveTab === canonical && !activeTabs.some((t) => t.toLowerCase() === canonical.toLowerCase())) {
          return {
            status: 422,
            body: { error: `Tab "${canonical}" is not open in Zellij. Open it and try again.` },
          };
        }
      }
    }

    // Global + Project tiers (operating principles + brief + active goals) — the
    // SAME assembler the /api/orchestration/run path uses. Previously this local
    // inject path skipped it, so quick-send / promptKey dispatches reached the
    // agent without the founder's standards or the project's roadmap (the
    // "inject-core bypass"). buildPromptWithSession then adds the Session tier, so
    // every dispatch now carries all three tiers. Best-effort: never break a
    // dispatch if context assembly fails.
    const projectContext = await getProjectContext(userId, canonical).catch(() => null);
    const contextBlock = renderProjectContextBlock(projectContext ?? undefined);
    // Captain RAG: surface relevant context from the operator's OTHER projects
    // (fleet-knowledge vector index), retrieved against this task. The current
    // project's own profile is already in contextBlock, so it's excluded. Off
    // (returns "") when EMBEDDINGS_BASE_URL is unset — e.g. local dev.
    const ragQuery = customPrompt ?? promptKey ?? "";
    const fleetBlock = ragQuery
      ? await retrieveFleetContextBlock(userId, ragQuery, { excludeProject: canonical }).catch(() => "")
      : "";
    const withContext = (body: string) =>
      [contextBlock || null, fleetBlock || null, body].filter(Boolean).join("\n\n");

    if (customPrompt) {
      prompt = withContext(customPrompt);
      promptLabel = customPrompt.slice(0, 40);
    } else if (promptKey) {
      const prompts = readPrompts();
      const base = prompts[promptKey];
      if (!base) return { status: 400, body: { error: `Unknown prompt key: ${promptKey}` } };
      // Project state context — same description shown on the badge
      // tooltip, prepended so the agent reasons from the same WHY.
      const injectRow = await getProjectState(userId, effectiveTab).catch(() => null);
      const stateKey = deriveProjectStateKey({
        agentRunning: injectRow?.agentRunning,
        tabOpen: injectRow?.tabOpen,
        sessionStatus: injectRow?.sessionStatus,
        readyAt: injectRow?.readyAt ? Math.floor(injectRow.readyAt.getTime() / 1000) : null,
        lockAt: injectRow?.lockAt ? Math.floor(injectRow.lockAt.getTime() / 1000) : null,
        closingAt: injectRow?.closingAt ? Math.floor(injectRow.closingAt.getTime() / 1000) : null,
        closedAt: injectRow?.closedAt ? Math.floor(injectRow.closedAt.getTime() / 1000) : null,
      });
      // Adapter owns prompt enrichment: the claude seam appends
      // ~/.claude/sessions/<tab>.md (identical to the prior buildPromptWithSession
      // call); adapters without a session seam fall back to identity.
      const enrichPrompt =
        (await import("@/lib/orchestration/adapter-registry")).adapterFor(eventAdapter)?.enrichPrompt ??
        ((b: string) => b);
      prompt = withContext(enrichPrompt(base, effectiveTab, projectStateDescription(stateKey)));
      const meta = readPromptMeta().find((m) => m.key === promptKey);
      promptLabel = meta ? `${meta.icon} ${meta.label}` : promptKey;
    } else {
      return { status: 400, body: { error: "promptKey or customPrompt required" } };
    }
  } else {
    // Remote (cloud host): assemble the SAME prompt body as orchestration/run —
    // profile + goals + intent template + fleet RAG — before queueing for the
    // runner. Previously we queued bare promptKey strings ("next_best"), so
    // phone/Loki/beacon dispatches reached agents without project context.
    const assembled = await assembleInjectPrompt({
      userId,
      projectKey: canonical,
      projectPath: projectPath ?? canonical,
      projectId,
      adapter: eventAdapter,
      promptKey,
      customPrompt,
      model: eventModel,
    });
    if (!assembled.ok) {
      return { status: assembled.status, body: { error: assembled.error } };
    }
    prompt = assembled.prompt;
    promptLabel = assembled.promptLabel;
  }

  const eventIntent: OrchestrationTaskIntentId | undefined =
    promptKey && ORCHESTRATION_TASK_INTENT_IDS.includes(promptKey as OrchestrationTaskIntentId)
      ? (promptKey as OrchestrationTaskIntentId)
      : customPrompt ? "custom" : undefined;

  const resolvedProjectPath = projectPath ?? canonical;
  const nowS = Math.floor(Date.now() / 1000);

  // Build the local injection function. PTY-backed agents are driven directly via
  // the executor (write to the owned PTY's stdin); otherwise fall back to the
  // legacy zellij path. Null in cloud mode → executeInject queues for the runner.
  const injectFn = !isRuntimeAvailable()
    ? null
    : ptyBacked
      ? async () => {
          executor.write(ptyWorkspaceId, prompt.endsWith("\r") ? prompt : `${prompt}\r`);
        }
      : async () => {
          const { injectIntoTab } = await import("@/lib/zellij");
          injectIntoTab(effectiveTab, prompt);
        };

  // Open a tracked run for every trackable dispatch, on BOTH the cloud and the
  // local-runtime path. Previously the local path was excluded (it relied on
  // home/worker.ts to open the run), but that worker was retired in the
  // bash-daemon kill — leaving local dispatches with no run at all, so Activity
  // showed "0 runs / 0 finished". The control poll closes it when the agent's
  // session handoff reports ready (see closeRunFromSession).
  const trackableIntent = eventIntent !== "hard_stop" && eventIntent !== "close_session";
  if (!runId && trackableIntent) {
    try {
      const run = await createOrchestrationRun({
        userId,
        projectId,
        adapter: eventAdapter,
        intent: eventIntent ?? "custom",
        state: "waiting",
        projectKey: canonical,
        projectPath: resolvedProjectPath,
        payload: {
          projectId,
          projectKey: canonical,
          projectPath: resolvedProjectPath,
          model: eventModel,
        },
      });
      runId = run.id;
    } catch (err) {
      console.error("[inject] tracked-run create failed:", err);
    }
  }

  // If the user is actively at the ZSH prompt in this tab, skip injection to
  // avoid garbling whatever they're typing.  Requires the fleetcrown-typing hooks
  // in ~/.zshrc (see scripts/install-fleetcrown-hooks.sh). This is a zellij-only
  // concept — a FleetCrown-owned PTY has no human at its prompt, so skip it.
  // Side effects (beacon cancel, /tmp state) run only after this gate passes.
  if (isRuntimeAvailable() && !ptyBacked) {
    const { isUserTypingInTab } = await import("@/lib/zellij");
    if (isUserTypingInTab(effectiveTab)) {
      const fingerprint = promptFingerprint(prompt);
      recordControlAuditEvent({
        userId,
        projectId,
        projectKey: canonical,
        tabName: effectiveTab,
        event: "inject_request",
        source: "api/inject",
        action: "refused",
        reason: "User is typing in the target tab",
        promptHash: fingerprint.promptHash,
        promptPreview: fingerprint.promptPreview,
        meta: { adapter: eventAdapter, promptKey: promptKey ?? "custom", runtimeAvailable: true },
      });
      return { status: 200, body: { ok: true, blocked: true, reason: "user-typing", tab: effectiveTab } };
    }
  }

  // Run local filesystem side-effects — the server process can always write to /tmp
  // regardless of whether it's inside a Zellij pane or not.
  if (isRuntimeAvailable()) {
    const [{ cancelActiveBeaconSessions }, { stateFile, clearHandshakeFiles }, fs] = await Promise.all([
      import("@/app/api/beacon/route"),
      import("@/lib/agent-config"),
      import("fs"),
    ]);

    await cancelActiveBeaconSessions(userId, effectiveTab);

    fs.writeFileSync(stateFile.prompt(effectiveTab), JSON.stringify({
      key: promptKey ?? "custom",
      label: promptLabel,
      startedAt: nowS,
      source: "inject",
      adapter: eventAdapter,
    }));

    clearHandshakeFiles(effectiveTab);

    if (promptKey === "hard_stop") {
      fs.writeFileSync(stateFile.sentinel(effectiveTab), "");
      fs.writeFileSync(stateFile.closing(effectiveTab), String(nowS));
      fs.writeFileSync(stateFile.closed(effectiveTab), String(nowS));
    } else if (promptKey === "close_session") {
      fs.writeFileSync(stateFile.sentinel(effectiveTab), "");
      fs.writeFileSync(stateFile.closing(effectiveTab), String(nowS));
    } else {
      try { fs.unlinkSync(stateFile.closing(effectiveTab)); } catch { /* gone */ }
    }
  }

  // Serialize same-project dispatch: if another agent's run is already ahead of
  // ours for this project, executeInject queues this one for the runner instead
  // of colliding in the shared tab/PTY/checkout (it drains FIFO when our run
  // becomes the oldest open one). Lifecycle intents (hard_stop/close_session)
  // must always fire to interrupt the running agent. Fail open on a DB hiccup —
  // never block a dispatch on a transient error.
  const lifecycleIntent = promptKey === "hard_stop" || promptKey === "close_session";
  const projectBusy = !lifecycleIntent
    && (await isProjectBusy(userId, canonical, { excludeRunId: runId }).catch(() => false));

  const result = await executeInject(
    { tab: effectiveTab, prompt, promptKey, promptLabel, adapter: eventAdapter, model: eventModel, projectId, projectKey: canonical, runId, dir: projectPath, projectBusy },
    userId,
    injectFn ?? (() => Promise.reject(new Error("Runtime unavailable"))),
  );

  if (!result.ok) {
    // The host's logs are unreliable from our env, so we persist to the DB.
    // Capture failures in debug_logs so post-incident forensics can answer
    // "what actually broke" without depending on log retention.
    logDebug({
      source: "api/inject",
      level: "error",
      message: `Injection failed: ${result.error}`,
      meta: {
        userId,
        tab: effectiveTab,
        canonical,
        mode: result.mode,
        adapter: eventAdapter,
        promptKey: promptKey ?? null,
        promptLabel,
        customPromptLen: customPrompt?.length ?? 0,
        runtimeAvailable: isRuntimeAvailable(),
      },
    });
    // Mirror the task_started emit on the failure branch so the
    // started/failed pair closes in orchestration_events — without this,
    // every failed inject left an orphan task_started with no paired
    // completion of any kind (task_completed OR task_failed).
    createOrchestrationEvent({
      userId,
      projectId,
      projectKey: canonical,
      eventType: "task_failed",
      source: "api-inject",
      adapter: eventAdapter,
      intent: eventIntent,
      detail: `${promptLabel}: ${result.error}`.slice(0, 400),
      happenedAt: new Date(nowS * 1000),
    }).catch((err) => console.error("[inject] db write failed:", err));
    const fingerprint = promptFingerprint(prompt);
    recordControlAuditEvent({
      userId,
      projectId,
      projectKey: canonical,
      tabName: effectiveTab,
      event: "inject_request",
      source: "api/inject",
      action: "failed",
      reason: result.error,
      promptHash: fingerprint.promptHash,
      promptPreview: fingerprint.promptPreview,
      meta: {
        mode: result.mode,
        adapter: eventAdapter,
        model: eventModel ?? null,
        promptKey: promptKey ?? "custom",
        runtimeAvailable: isRuntimeAvailable(),
      },
    });
    return { status: 500, body: { error: `Injection failed: ${result.error}` } };
  }

  // Prompt history records the user's request in both modes. A queued remote
  // request is not active work until the runner actually injects it and pushes
  // fresh runtime state back to the control plane.
  insertPromptHistory(userId, {
    projectId,
    projectKey: canonical,
    projectPath: resolvedProjectPath,
    adapter: eventAdapter,
    intent: eventIntent ?? "custom",
    customPrompt: customPrompt ?? null,
    // `prompt` is the fully assembled body — custom text or rendered intent
    // template — that was injected into the agent's tab. Persisting it makes
    // "Next best" rows showable as the actual prompt in the activity view.
    resolvedPrompt: prompt,
  }).catch((err) => console.error("[inject] db write failed:", err));

  if (result.mode === "direct") {
    persistProjectRuntimeIfNewer({
      projectKey: canonical,
      projectId,
      userId,
      tabName: effectiveTab,
      runtimeObservedAt: new Date(),
      currentPromptKey: promptKey ?? "custom",
      currentPromptLabel: promptLabel,
      currentPromptStartedAt: new Date(nowS * 1000),
    }).catch((err) => console.error("[inject] db write failed:", err));
  }

  createOrchestrationEvent({
    userId,
    projectId,
    projectKey: canonical,
    eventType: (promptKey === "close_session" || promptKey === "hard_stop") ? "close_requested" : "continue_requested",
    source: "api-inject",
    adapter: eventAdapter,
    intent: eventIntent,
    detail: promptLabel,
    happenedAt: new Date(nowS * 1000),
  }).catch((err) => console.error("[inject] db write failed:", err));

  if (result.mode === "direct") {
    createOrchestrationEvent({
      userId,
      projectId,
      projectKey: canonical,
      eventType: "task_started",
      source: "api-inject",
      adapter: eventAdapter,
      intent: eventIntent,
      detail: promptLabel,
      happenedAt: new Date(nowS * 1000),
    }).catch((err) => console.error("[inject] db write failed:", err));
  }

  const fingerprint = promptFingerprint(prompt);
  recordControlAuditEvent({
    userId,
    projectId,
    projectKey: canonical,
    tabName: effectiveTab,
    event: "inject_request",
    source: "api/inject",
    action: result.mode === "queued" ? "queued" : "injected",
    reason:
      result.mode === "queued"
        ? ((result as { runnerConnected?: boolean }).runnerConnected === false
            ? "Queued — Fleet Runner OFFLINE (runs on reconnect)"
            : "Queued for local runner")
        : "Injected into local runtime",
    promptHash: fingerprint.promptHash,
    promptPreview: fingerprint.promptPreview,
    commandId: result.mode === "queued" ? (result as { commandId: string }).commandId : null,
    meta: {
      adapter: eventAdapter,
      model: eventModel ?? null,
      promptKey: promptKey ?? "custom",
      promptLabel,
      runtimeAvailable: isRuntimeAvailable(),
    },
  });

  const queuedOffline =
    result.mode === "queued" &&
    (result as { runnerConnected?: boolean }).runnerConnected === false;

  // Producer for the hosted runner: when the local Fleet Runner is offline, a
  // WORK dispatch doesn't have to wait forever — auto-route it to the hosted
  // runner (Hermes), which clones the repo, makes the change, and opens a PR.
  // Only for real coding tasks with a git URL — never for lifecycle commands
  // (close/stop) or projects we can't clone. Hermes uses its own configured
  // Nous model, so we deliberately don't pass the local agent's model pref.
  const isLifecycle = promptKey === "close_session" || promptKey === "hard_stop";
  let hostedDispatchId: string | undefined;
  if (queuedOffline && !isLifecycle && dbMatch.gitUrl) {
    hostedDispatchId = await enqueueHostedDispatchCommand(userId, {
      projectKey: canonical,
      gitUrl: dbMatch.gitUrl,
      task: prompt,
    }).catch((err) => {
      console.error("[inject] hosted-dispatch enqueue failed:", err);
      return undefined;
    });
  }

  return {
    status: 200,
    body: {
      ok: true,
      tab: effectiveTab,
      mode: result.mode,
      ...(result.mode === "queued" && {
        commandId: (result as { commandId: string }).commandId,
        runnerConnected: (result as { runnerConnected?: boolean }).runnerConnected ?? null,
      }),
      // Fail loud, not silent: a dispatch that queued with no live runner says so,
      // so the UI can warn instead of pretending it's running.
      ...(queuedOffline && {
        warning: "runner-offline",
        message: hostedDispatchId
          ? "Fleet Runner is offline — handed to the hosted runner (Hermes), which will make the change and open a PR. It'll also run locally when your runner reconnects."
          : "Fleet Runner is offline — this command is queued and will run as soon as it reconnects.",
        ...(hostedDispatchId && { hostedDispatchId, hostedRunner: "hermes" }),
      }),
      ...(runId && { runId }),
    },
  };
}
