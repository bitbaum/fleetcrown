import { NextRequest, NextResponse } from "next/server";
import { ensureUserProjectEntityLinks, getOrgProjects } from "@/db/queries/user-projects";
import { ORCHESTRATION_ADAPTER_IDS, ORCHESTRATION_TASK_INTENT_IDS, type OrchestrationTaskIntentId } from "@/lib/orchestration";
import type { AgentOption } from "@/lib/agent-registry";
import { getSessionUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isRuntimeAvailable } from "@/lib/runtime";
import { executeInject } from "@/lib/executor";
import { createOrchestrationEvent } from "@/db/queries/orchestration-events";
import { insertPromptHistory } from "@/db/queries/prompt-history";
import { upsertProjectState } from "@/db/queries/project-states";

const InjectBody = z.object({
  tab:          z.string().min(1).max(80),
  promptKey:    z.string().optional(),
  customPrompt: z.string().max(4000).optional(),
  adapter:      z.enum(ORCHESTRATION_ADAPTER_IDS).optional(),
}).refine((d) => d.promptKey || d.customPrompt, { message: "promptKey or customPrompt required" });

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, InjectBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { tab, promptKey, customPrompt, adapter } = dataOrResp;
  const eventAdapter: AgentOption = adapter ?? "claude";

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve canonical tab name and project path — own projects first, then org team projects.
  const [dbProjects, dbTeamProjects] = await Promise.all([
    ensureUserProjectEntityLinks(userId).catch(() => []),
    getOrgProjects(userId).catch(() => []),
  ]);
  const dbMatch =
    dbProjects.find((p) => p.name.toLowerCase() === tab.toLowerCase()) ??
    dbTeamProjects.find((p) => p.name.toLowerCase() === tab.toLowerCase());
  if (!dbMatch) {
    return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 404 });
  }

  const canonical = dbMatch.name;
  const projectPath: string | null = dbMatch.dirPath ?? null;
  const projectId: string | null = dbMatch.entityProjectId ?? null;

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
      prompt = buildPromptWithSession(base, effectiveTab);
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

  // Run local filesystem side-effects immediately — the server process can always write to /tmp
  // regardless of whether it's inside a Zellij pane or not.
  if (isRuntimeAvailable()) {
    const [{ cancelActiveBeaconSessions }, { stateFile, clearHandshakeFiles }, fs] = await Promise.all([
      import("@/app/api/beacon/route"),
      import("@/lib/agent-config"),
      import("fs"),
    ]);

    cancelActiveBeaconSessions(effectiveTab);

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

  // Build the Zellij injection function — executor calls it only when ZELLIJ_SESSION_NAME
  // is present in this process (dev server inside Zellij). Otherwise it queues for the daemon.
  const injectFn = isRuntimeAvailable()
    ? async () => {
        const { injectIntoTab } = await import("@/lib/zellij");
        injectIntoTab(effectiveTab, prompt);
      }
    : null;

  // If the user is actively at the ZSH prompt in this tab, skip injection to
  // avoid garbling whatever they're typing.  Requires the cockpit-typing hooks
  // in ~/.zshrc (see scripts/install-cockpit-hooks.sh).
  if (isRuntimeAvailable()) {
    const { isUserTypingInTab } = await import("@/lib/zellij");
    if (isUserTypingInTab(effectiveTab)) {
      return NextResponse.json({ ok: true, blocked: true, reason: "user-typing", tab: effectiveTab });
    }
  }

  const result = await executeInject(
    { tab: effectiveTab, prompt, promptKey, promptLabel, adapter: eventAdapter, projectId, projectKey: canonical },
    userId,
    injectFn ?? (() => Promise.reject(new Error("Runtime unavailable"))),
  );

  if (!result.ok) {
    return NextResponse.json({ error: `Injection failed: ${result.error}` }, { status: 500 });
  }

  // DB side-effects work in both modes (local and remote).
  insertPromptHistory(userId, {
    projectId,
    projectKey: canonical,
    projectPath: resolvedProjectPath,
    adapter: eventAdapter,
    intent: eventIntent ?? "custom",
    customPrompt: customPrompt ?? null,
  }).catch(() => {});

  upsertProjectState({
    projectKey: canonical,
    projectId,
    userId,
    tabName: effectiveTab,
    currentPromptKey: promptKey ?? "custom",
    currentPromptLabel: promptLabel,
    currentPromptStartedAt: new Date(nowS * 1000),
  }).catch(() => {});

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
  }).catch(() => {});

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
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    tab: effectiveTab,
    mode: result.mode,
    ...(result.mode === "queued" && { commandId: (result as { commandId: string }).commandId }),
  });
}
