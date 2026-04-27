import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const HOME = process.env.HOME ?? "/home/g";
const PROMPTS_FILE = path.join(HOME, ".config", "claude-prompts.json");
const META_FILE = path.join(HOME, ".config", "claude-prompts-meta.json");
const SESSIONS_DIR = path.join(HOME, ".claude", "sessions");
const PROJECTS_CONF = path.join(HOME, ".config", "claude-projects.conf");

function readProjects(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(PROJECTS_CONF)) return map;
  for (const line of fs.readFileSync(PROJECTS_CONF, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [tab, dir] = trimmed.split("|");
    if (tab && dir) map.set(tab.trim().toLowerCase(), tab.trim());
  }
  return map;
}

function readPrompts(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(PROMPTS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

type PromptMeta = { key: string; label: string; icon: string };
function readPromptMeta(): PromptMeta[] {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function readSession(tab: string): string | null {
  const filePath = path.join(SESSIONS_DIR, `${tab}.md`);
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null;
  } catch {
    return null;
  }
}

function buildPrompt(base: string, tab: string): string {
  const sessionFile = path.join(SESSIONS_DIR, `${tab}.md`);
  const session = readSession(tab);
  if (session) {
    return `${base}\n\nSession state from last run:\n${session}\n\nUpdate ${sessionFile} when done: what you completed and what remains.`;
  }
  return `${base}\n\nBefore stopping, create ${sessionFile} with these lines: "done: <what you completed>", "next: <what remains>", "tests: <status>", "todos: <count>", "health: <good|degraded|critical>".`;
}

function injectIntoTab(tab: string, prompt: string): void {
  const escaped = prompt.replace(/'/g, `'"'"'`);
  execSync(`zellij action go-to-tab-name '${tab}'`);
  execSync("sleep 0.3");
  execSync(`zellij action write-chars '${escaped}'`);
  execSync("sleep 0.1");
  execSync("zellij action write 13");
}

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

  const projects = readProjects();
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
    prompt = buildPrompt(base, canonical);
    const meta = readPromptMeta().find((m) => m.key === promptKey);
    promptLabel = meta ? `${meta.icon} ${meta.label}` : promptKey;
  } else {
    return NextResponse.json({ error: "promptKey or customPrompt required" }, { status: 400 });
  }

  try {
    injectIntoTab(canonical, prompt);

    const nowS = Math.floor(Date.now() / 1000);

    // Track which prompt is currently running (stop.sh clears this when Claude exits)
    fs.writeFileSync(
      path.join("/tmp", `claude-current-prompt-${canonical}`),
      JSON.stringify({ key: promptKey ?? "custom", label: promptLabel, startedAt: nowS })
    );

    // Clear the "ready" signal — Claude is now busy
    try { fs.unlinkSync(path.join("/tmp", `claude-ready-${canonical}`)); } catch { /* already gone */ }

    if (promptKey === "close_session") {
      // Suppress the next stop-hook popup — infrastructure-side, reliable
      fs.writeFileSync(path.join("/tmp", `claude-session-closed-${canonical}`), "");
      // Signal "closing in progress" — NOT "closed" yet (Claude is still running the close prompt).
      // stop.sh will write claude-closed-<tab> when Claude actually finishes.
      fs.writeFileSync(path.join("/tmp", `claude-closing-${canonical}`), String(nowS));
      // Clear any stale closed file from a previous session
      try { fs.unlinkSync(path.join("/tmp", `claude-closed-${canonical}`)); } catch { /* ok */ }
    }

    return NextResponse.json({ ok: true, tab: canonical });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Injection failed: ${msg}` }, { status: 500 });
  }
}
