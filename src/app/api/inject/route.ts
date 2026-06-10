import { NextRequest, NextResponse } from "next/server";
import { ensureUserProjectEntityLinks, getOrgProjects } from "@/db/queries/user-projects";
import { ORCHESTRATION_ADAPTER_IDS, ORCHESTRATION_TASK_INTENT_IDS, type OrchestrationTaskIntentId } from "@/lib/orchestration";
import { getApiUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isRuntimeAvailable } from "@/lib/runtime";
import { executeInject } from "@/lib/executor";
import { createOrchestrationEvent } from "@/db/queries/orchestration-events";
import { createOrchestrationRun } from "@/db/queries/orchestration-runs";
import { insertPromptHistory } from "@/db/queries/prompt-history";
import { getProjectState, persistProjectRuntimeIfNewer } from "@/db/queries/project-states";
import { deriveProjectStateKey, projectStateDescription } from "@/lib/control-states";
import { logDebug } from "@/db/queries/debug-logs";
import { promptFingerprint, recordControlAuditEvent } from "@/db/queries/control-audit-events";

const InjectBody = z.object({
  tab:          z.string().min(1).max(80),
  promptKey:    z.string().optional(),
  customPrompt: z.string().max(4000).optional(),
  adapter:      z.enum(ORCHESTRATION_ADAPTER_IDS).optional(),
  runId:        z.string().uuid().optional(),
}).refine((d) => d.promptKey || d.customPrompt, { message: "promptKey or customPrompt required" });

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, InjectBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { tab, promptKey, customPrompt, adapter } = dataOrResp;
  let runId = dataOrResp.runId;
  // Provisional adapter for early-return logging; the real resolution happens
  // after we've looked up dbMatch and can honor user_projects.agent_pref below.
  type ResolvedAdapter = (typeof ORCHESTRATION_ADAPTER_IDS)[number];
  let eventAdapter: ResolvedAdapter = adapter ?? "claude";

  const userId = await getApiUserId();
  if (!userId) {
    // Session-expiry / unauthenticated path. This is the most likely
    // server-side root cause of the "I sent something but it isn't here"
    // mobile incident — a long-lived mobile tab whose JWT lapsed, the
    // client throws and surfaces the inline error (post-9c2525c), and
    // forensics need the server-side counterpart to correlate. Body has
    // already parsed at this point, so a 401 here is a real user attempt
    // (random bots fail readJsonBody → 400 above, never reach this line).
    logDebug({
      source: "api/inject",
      level: "warn",
      message: "Unauthenticated inject attempt — likely session expiry",
      meta: {
        tab,
        adapter: eventAdapter,
        hasPromptKey: !!promptKey,
        hasCustomPrompt: !!customPrompt,
        customPromptLen: customPrompt?.length ?? 0,
        userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
        referer: req.headers.get("referer") ?? null,
      },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 404 });
  }

  const canonical = dbMatch.name;
  const projectPath: string | null = dbMatch.dirPath ?? null;
  const projectId: string | null = dbMatch.entityProjectId ?? null;

  // Honor the project's per-row agent preference when the caller didn't pin one.
  // Without this the daemon defaults to "claude" for every project regardless
  // of agent_pref, so a Gemini project gets a Claude launch and a Cursor
  // project gets Claude too. The DB column is text, so validate it's still a
  // supported adapter before trusting it.
  if (!adapter && dbMatch.agentPref) {
    const ids = ORCHESTRATION_ADAPTER_IDS as readonly string[];
    if (ids.includes(dbMatch.agentPref)) {
      eventAdapter = dbMatch.agentPref as ResolvedAdapter;
    }
  }

  // Model override from user_projects.modelPref. The daemon's execute_inject
  // auto-launch reads payload.model and prefers it over the conf-file model,
  // so a project pinned to "opus" launches Claude with the opus model and a
  // Codex project pinned to "gpt-5" gets gpt-5 instead of the daemon's
  // hardcoded gpt-5.4 default. Caller-supplied model (none yet, but kept for
  // future explicit dispatch) is not in this route's schema — pure DB read.
  const eventModel = dbMatch.modelPref?.trim() || undefined;

  let prompt: string;
  let promptLabel = "Custom";
  let effectiveTab = canonical;

  if (isRuntimeAvailable()) {
    // Local: resolve live zellij tab and build prompt with session context.
    // These imports call execSync / read /tmp files — only safe locally.
    const { resolveEffectiveTab, readPrompts, readPromptMeta, buildPromptWithSession, getZellijTabs } =
      await import("@/lib/agent-config").then(async (m) => ({
        ...m,
        getZellijTabs: (await import("@/lib/zellij")).getZellijTabs,
      }));

    const activeTabs = await getZellijTabs();
    if (activeTabs.length > 0) {
      effectiveTab = resolveEffectiveTab(canonical, activeTabs);
      if (effectiveTab === canonical && !activeTabs.some((t) => t.toLowerCase() === canonical.toLowerCase())) {
        return NextResponse.json(
          { error: `Tab "${canonical}" is not open in Zellij. Open it and try again.` },
          { status: 422 },
        );
      }
    }

    if (customPrompt) {
      prompt = customPrompt;
      promptLabel = customPrompt.slice(0, 40);
    } else if (promptKey) {
      const prompts = readPrompts();
      const base = prompts[promptKey];
      if (!base) return NextResponse.json({ error: `Unknown prompt key: ${promptKey}` }, { status: 400 });
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
      prompt = buildPromptWithSession(base, effectiveTab, projectStateDescription(stateKey));
      const meta = readPromptMeta().find((m) => m.key === promptKey);
      promptLabel = meta ? `${meta.icon} ${meta.label}` : promptKey;
    } else {
      return NextResponse.json({ error: "promptKey or customPrompt required" }, { status: 400 });
    }
  } else {
    // Remote: use the raw prompt text, no session-file enrichment available.
    if (customPrompt) {
      prompt = customPrompt;
      promptLabel = customPrompt.slice(0, 40);
    } else if (promptKey) {
      // Prompt key without local session context — send the key as the label,
      // the local daemon will resolve the full prompt text when it executes.
      prompt = promptKey;
      promptLabel = promptKey;
    } else {
      return NextResponse.json({ error: "promptKey or customPrompt required" }, { status: 400 });
    }
  }

  const eventIntent: OrchestrationTaskIntentId | undefined =
    promptKey && ORCHESTRATION_TASK_INTENT_IDS.includes(promptKey as OrchestrationTaskIntentId)
      ? (promptKey as OrchestrationTaskIntentId)
      : customPrompt ? "custom" : undefined;

  const resolvedProjectPath = projectPath ?? canonical;
  const nowS = Math.floor(Date.now() / 1000);

  // Build the Zellij injection function — executor calls it only when ZELLIJ_SESSION_NAME
  // is present in this process (dev server inside Zellij). Otherwise it queues for the daemon.
  const injectFn = isRuntimeAvailable()
    ? async () => {
        const { injectIntoTab } = await import("@/lib/zellij");
        injectIntoTab(effectiveTab, prompt);
      }
    : null;

  const trackableIntent = eventIntent !== "hard_stop" && eventIntent !== "close_session";
  if (!runId && trackableIntent && !isRuntimeAvailable()) {
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
  // in ~/.zshrc (see scripts/install-fleetcrown-hooks.sh).
  // Side effects (beacon cancel, /tmp state) run only after this gate passes.
  if (isRuntimeAvailable()) {
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
      return NextResponse.json({ ok: true, blocked: true, reason: "user-typing", tab: effectiveTab });
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

  const result = await executeInject(
    { tab: effectiveTab, prompt, promptKey, promptLabel, adapter: eventAdapter, model: eventModel, projectId, projectKey: canonical, runId },
    userId,
    injectFn ?? (() => Promise.reject(new Error("Runtime unavailable"))),
  );

  if (!result.ok) {
    // Per pattern_vercel_log_fallback: journalctl on Vercel is unreliable.
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
    return NextResponse.json({ error: `Injection failed: ${result.error}` }, { status: 500 });
  }

  // Prompt history records the user's request in both modes. A queued remote
  // request is not active work until the daemon actually injects it and pushes
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
    reason: result.mode === "queued" ? "Queued for local daemon" : "Injected into local runtime",
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

  return NextResponse.json({
    ok: true,
    tab: effectiveTab,
    mode: result.mode,
    ...(result.mode === "queued" && { commandId: (result as { commandId: string }).commandId }),
    ...(runId && { runId }),
  });
}
