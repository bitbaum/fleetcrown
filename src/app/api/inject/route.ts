import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import {
  stateFile,
  readProjectsMap,
  readPrompts,
  readPromptMeta,
  buildPromptWithSession,
} from "@/lib/claude-config";
import { injectIntoTab } from "@/lib/zellij";

export async function POST(req: NextRequest) {
  let body: { tab?: string; promptKey?: string; customPrompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tab, promptKey, customPrompt } = body;

  if (!tab || typeof tab !== "string" || tab.length > 80) {
    return NextResponse.json({ error: "tab is required" }, { status: 400 });
  }

  const projects = readProjectsMap();
  const canonical = projects.get(tab.toLowerCase());
  if (!canonical) {
    return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 404 });
  }

  let prompt: string;
  let promptLabel = "Custom";

  if (customPrompt) {
    if (typeof customPrompt !== "string" || customPrompt.length > 4000) {
      return NextResponse.json({ error: "customPrompt too long" }, { status: 400 });
    }
    prompt = customPrompt;
    promptLabel = customPrompt.slice(0, 40);
  } else if (promptKey) {
    const prompts = readPrompts();
    const base = prompts[promptKey];
    if (!base) {
      return NextResponse.json({ error: `Unknown prompt key: ${promptKey}` }, { status: 400 });
    }
    prompt = buildPromptWithSession(base, canonical);
    const meta = readPromptMeta().find((m) => m.key === promptKey);
    promptLabel = meta ? `${meta.icon} ${meta.label}` : promptKey;
  } else {
    return NextResponse.json({ error: "promptKey or customPrompt required" }, { status: 400 });
  }

  try {
    injectIntoTab(canonical, prompt);

    const nowS = Math.floor(Date.now() / 1000);

    // Track which prompt is currently running (stop.sh clears this when Claude exits)
    fs.writeFileSync(stateFile.prompt(canonical), JSON.stringify({
      key: promptKey ?? "custom",
      label: promptLabel,
      startedAt: nowS,
    }));

    // Any injection means we're continuing — clear stale close state from prior sessions
    try { fs.unlinkSync(stateFile.ready(canonical)); } catch { /* gone */ }
    try { fs.unlinkSync(stateFile.closed(canonical)); } catch { /* gone */ }

    if (promptKey === "close_session") {
      // Suppress the next stop-hook popup — infrastructure-side, reliable
      fs.writeFileSync(stateFile.sentinel(canonical), "");
      // Signal "closing in progress" — NOT "closed" yet (Claude is still running the close prompt).
      // stop.sh will write claude-closed-<tab> when Claude actually finishes.
      fs.writeFileSync(stateFile.closing(canonical), String(nowS));
    } else {
      // Non-close injection: also clear any stale closing state
      try { fs.unlinkSync(stateFile.closing(canonical)); } catch { /* gone */ }
    }

    return NextResponse.json({ ok: true, tab: canonical });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Injection failed: ${msg}` }, { status: 500 });
  }
}
