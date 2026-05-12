import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import {
  stateFile,
  clearHandshakeFiles,
  readProjectsMap,
  resolveEffectiveTab,
  readPrompts,
  readPromptMeta,
  buildPromptWithSession,
  parseProjectsConf,
} from "@/lib/agent-config";
import { injectIntoTab, getZellijTabs } from "@/lib/zellij";
import { cancelActiveBeaconSessions } from "@/app/api/beacon/route";
import { createOrchestrationEvent } from "@/db/queries/orchestration-events";
import { insertPromptHistory } from "@/db/queries/prompt-history";
import { upsertProjectState } from "@/db/queries/project-states";
import { getUserProjects } from "@/db/queries/user-projects";
import { ORCHESTRATION_TASK_INTENT_IDS, type OrchestrationTaskIntentId } from "@/lib/orchestration";
import { getCurrentUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const InjectBody = z.object({
  tab:          z.string().min(1).max(80),
  promptKey:    z.string().optional(),
  customPrompt: z.string().max(4000).optional(),
}).refine((d) => d.promptKey || d.customPrompt, { message: "promptKey or customPrompt required" });

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, InjectBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { tab, promptKey, customPrompt } = dataOrResp;

  const userId = await getCurrentUserId();

  // Resolve canonical tab name: conf file first, DB fallback (DB-only projects
  // added via Settings would fail the conf-file lookup without this fallback).
  const projectsMap = readProjectsMap();
  let canonical = projectsMap.get(tab.toLowerCase());
  let projectPath: string | null = parseProjectsConf().find(
    (p) => p.tab.toLowerCase() === tab.toLowerCase(),
  )?.dir ?? null;

  if (!canonical) {
    const dbProjects = await getUserProjects(userId).catch(() => []);
    const dbMatch = dbProjects.find((p) => p.name.toLowerCase() === tab.toLowerCase() && p.dirPath);
    if (!dbMatch) {
      return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 404 });
    }
    canonical = dbMatch.name;
    projectPath = dbMatch.dirPath!;
  }

  // Resolve the live Zellij tab name (canonical may be an alias of the running tab).
  const activeTabs = await getZellijTabs();
  let effectiveTab = canonical;
  if (activeTabs.length > 0) {
    effectiveTab = resolveEffectiveTab(canonical, activeTabs);
    if (effectiveTab === canonical && !activeTabs.some((t) => t.toLowerCase() === canonical.toLowerCase())) {
      return NextResponse.json(
        { error: `Tab "${canonical}" is not open in Zellij. Open it and try again.` },
        { status: 422 },
      );
    }
  }

  let prompt: string;
  let promptLabel = "Custom";

  if (customPrompt) {
    prompt = customPrompt;
    promptLabel = customPrompt.slice(0, 40);
  } else if (promptKey) {
    const prompts = readPrompts();
    const base = prompts[promptKey];
    if (!base) {
      return NextResponse.json({ error: `Unknown prompt key: ${promptKey}` }, { status: 400 });
    }
    prompt = buildPromptWithSession(base, effectiveTab);
    const meta = readPromptMeta().find((m) => m.key === promptKey);
    promptLabel = meta ? `${meta.icon} ${meta.label}` : promptKey;
  } else {
    return NextResponse.json({ error: "promptKey or customPrompt required" }, { status: 400 });
  }

  const eventIntent: OrchestrationTaskIntentId | undefined = promptKey && ORCHESTRATION_TASK_INTENT_IDS.includes(promptKey as OrchestrationTaskIntentId)
    ? (promptKey as OrchestrationTaskIntentId)
    : customPrompt ? "custom" : undefined;

  // Use resolved projectPath, falling back to canonical name if neither source has it.
  const resolvedProjectPath = projectPath ?? canonical;

  try {
    injectIntoTab(effectiveTab, prompt);
    cancelActiveBeaconSessions(effectiveTab);

    const nowS = Math.floor(Date.now() / 1000);

    // Record injection in prompt history so the activity log and
    // recent-custom-prompts autocomplete have real data.
    insertPromptHistory(userId, {
      projectKey: canonical,
      projectPath: resolvedProjectPath,
      adapter: "claude",
      intent: eventIntent ?? "custom",
      customPrompt: customPrompt ?? null,
    }).catch(() => {});

    // Track which prompt is currently running (stop.sh clears this using the live tab name)
    fs.writeFileSync(stateFile.prompt(effectiveTab), JSON.stringify({
      key: promptKey ?? "custom",
      label: promptLabel,
      startedAt: nowS,
    }));

    // Persist to DB so Cockpit survives a reboot (fire-and-forget)
    upsertProjectState({
      projectKey: canonical,
      userId,
      tabName: effectiveTab,
      currentPromptKey: promptKey ?? "custom",
      currentPromptLabel: promptLabel,
      currentPromptStartedAt: new Date(nowS * 1000),
    }).catch(() => {});

    createOrchestrationEvent({
      userId,
      projectKey: canonical,
      eventType: (promptKey === "close_session" || promptKey === "hard_stop") ? "close_requested" : "continue_requested",
      source: "api-inject",
      adapter: "claude",
      intent: eventIntent,
      detail: promptLabel,
      happenedAt: new Date(nowS * 1000),
    }).catch(() => {});

    createOrchestrationEvent({
      userId,
      projectKey: canonical,
      eventType: "task_started",
      source: "api-inject",
      adapter: "claude",
      intent: eventIntent,
      detail: promptLabel,
      happenedAt: new Date(nowS * 1000),
    }).catch(() => {});

    // Any injection means we're continuing — clear stale ready/closed state (both naming conventions)
    clearHandshakeFiles(effectiveTab);

    if (promptKey === "hard_stop") {
      // Hard stop: block auto-continue immediately and mark the session as closed.
      // Claude will finish its current tool call, see the STOP prompt, and go idle.
      // stop.sh won't re-open because the sentinel and closed files are already present.
      fs.writeFileSync(stateFile.sentinel(effectiveTab), "");
      fs.writeFileSync(stateFile.closing(effectiveTab), String(nowS));
      fs.writeFileSync(stateFile.closed(effectiveTab), String(nowS));
    } else if (promptKey === "close_session") {
      // Suppress the next stop-hook popup — infrastructure-side, reliable
      fs.writeFileSync(stateFile.sentinel(effectiveTab), "");
      // Signal "closing in progress" — NOT "closed" yet (Claude is still running the close prompt).
      // stop.sh will write claude-closed-<tab> when Claude actually finishes.
      fs.writeFileSync(stateFile.closing(effectiveTab), String(nowS));
    } else {
      // Non-close injection: also clear any stale closing state
      try { fs.unlinkSync(stateFile.closing(effectiveTab)); } catch { /* gone */ }
    }

    return NextResponse.json({ ok: true, tab: effectiveTab });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Injection failed: ${msg}` }, { status: 500 });
  }
}
