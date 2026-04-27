import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const HOME = process.env.HOME ?? "/home/g";
const PROMPTS_FILE = path.join(HOME, ".config", "claude-prompts.json");
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
  // Escape single quotes for shell safety
  const escaped = prompt.replace(/'/g, `'"'"'`);
  execSync(`zellij action go-to-tab-name '${tab}'`);
  // Brief pause so zellij can focus the tab
  execSync("sleep 0.3");
  execSync(`zellij action write-chars '${escaped}'`);
  execSync("sleep 0.1");
  execSync("zellij action write 13"); // Enter key (byte 13 = CR)
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

  // Validate tab exists in claude-projects.conf
  const projects = readProjects();
  const canonical = projects.get(tab.toLowerCase());
  if (!canonical) {
    return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 404 });
  }

  let prompt: string;

  if (customPrompt) {
    if (typeof customPrompt !== "string" || customPrompt.length > 4000) {
      return NextResponse.json({ error: "customPrompt too long" }, { status: 400 });
    }
    prompt = customPrompt;
  } else if (promptKey) {
    const prompts = readPrompts();
    const base = prompts[promptKey];
    if (!base) {
      return NextResponse.json({ error: `Unknown prompt key: ${promptKey}` }, { status: 400 });
    }
    prompt = buildPrompt(base, canonical);
  } else {
    return NextResponse.json({ error: "promptKey or customPrompt required" }, { status: 400 });
  }

  try {
    injectIntoTab(canonical, prompt);
    // Always clear the ready signal
    try { fs.unlinkSync(path.join("/tmp", `claude-ready-${canonical}`)); } catch { /* already gone */ }
    if (promptKey === "close_session") {
      // Write sentinel (suppresses popup on next Claude exit) and closed file (shows celebration UI)
      // Infrastructure handles this — not relying on the LLM to write these files
      fs.writeFileSync(path.join("/tmp", `claude-session-closed-${canonical}`), "");
      fs.writeFileSync(path.join("/tmp", `claude-closed-${canonical}`), String(Math.floor(Date.now() / 1000)));
    }
    return NextResponse.json({ ok: true, tab: canonical });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Injection failed: ${msg}` }, { status: 500 });
  }
}
