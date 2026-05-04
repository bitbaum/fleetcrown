import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import {
  stateFile,
  readProjectsMap,
  resolveEffectiveTab,
  readPrompts,
  readPromptMeta,
  buildPromptWithSession,
} from "@/lib/claude-config";
import { injectIntoTab } from "@/lib/zellij";
import { upsertProjectState } from "@/db/queries/project-states";
import { getCurrentUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const execAsync = promisify(exec);

const InjectBody = z.object({
  tab:          z.string().min(1).max(80),
  promptKey:    z.string().optional(),
  customPrompt: z.string().max(4000).optional(),
}).refine((d) => d.promptKey || d.customPrompt, { message: "promptKey or customPrompt required" });

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, InjectBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { tab, promptKey, customPrompt } = dataOrResp;

  const projectsMap = readProjectsMap();
  const canonical = projectsMap.get(tab.toLowerCase());
  if (!canonical) {
    return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 404 });
  }

  // Resolve the live Zellij tab name (canonical may be an alias of the running tab).
  let effectiveTab = canonical;
  try {
    const { stdout } = await execAsync("zellij action query-tab-names", { timeout: 2000 });
    const activeTabs = stdout.trim().split("\n").map((t) => t.trim()).filter(Boolean);
    if (activeTabs.length > 0) {
      effectiveTab = resolveEffectiveTab(canonical, activeTabs);
      if (effectiveTab === canonical && !activeTabs.some((t) => t.toLowerCase() === canonical.toLowerCase())) {
        return NextResponse.json(
          { error: `Tab "${canonical}" is not open in Zellij. Open it and try again.` },
          { status: 422 },
        );
      }
    }
  } catch {
    // Zellij unavailable — proceed anyway so non-Zellij use cases aren't blocked.
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

  const userId = await getCurrentUserId();

  try {
    injectIntoTab(effectiveTab, prompt);

    const nowS = Math.floor(Date.now() / 1000);

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

    // Any injection means we're continuing — clear stale close state from prior sessions
    try { fs.unlinkSync(stateFile.ready(effectiveTab)); } catch { /* gone */ }
    try { fs.unlinkSync(stateFile.closed(effectiveTab)); } catch { /* gone */ }

    if (promptKey === "close_session") {
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
