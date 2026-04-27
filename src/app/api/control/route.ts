import { NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const HOME = process.env.HOME ?? "/home/g";
const PROJECTS_CONF = path.join(HOME, ".config", "claude-projects.conf");
const SESSIONS_DIR = path.join(HOME, ".claude", "sessions");
const META_FILE = path.join(HOME, ".config", "claude-prompts-meta.json");

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProjectState = {
  tab: string;
  dir: string;
  session: SessionState | null;
  git: GitState | null;
  claudeRunning: boolean;
  /** Unix seconds — set when Claude just finished, cleared by /api/inject */
  readyAt: number | null;
  /** Unix seconds — set when close_session was injected; shows celebration UI instead of countdown */
  closedAt: number | null;
};

export type SessionState = {
  done: string;
  next: string;
  tests: string;
  todos: string;
  health: string;
  mtime: number;
};

export type GitState = {
  branch: string;
  lastMsg: string;
  lastWhen: string;
  dirty: boolean;
  todayCount: number;
};

export type PromptMeta = {
  key: string;
  slot: number;
  icon: string;
  label: string;
  style: string;
  category: string;
};

export type ControlData = {
  projects: ProjectState[];
  prompts: PromptMeta[];
};

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseProjects(): { tab: string; dir: string }[] {
  if (!fs.existsSync(PROJECTS_CONF)) return [];
  const seen = new Set<string>();
  const result: { tab: string; dir: string }[] = [];
  for (const line of fs.readFileSync(PROJECTS_CONF, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split("|");
    if (parts.length < 2) continue;
    const tab = parts[0].trim();
    const dir = parts[1].trim();
    if (!seen.has(tab.toLowerCase())) {
      seen.add(tab.toLowerCase());
      result.push({ tab, dir });
    }
  }
  return result;
}

function parseSession(tab: string): SessionState | null {
  const file = path.join(SESSIONS_DIR, `${tab}.md`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const fields: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^(done|next|tests|todos|health):\s*(.*)/);
      if (m) fields[m[1]] = m[2].trim();
    }
    const mtime = fs.statSync(file).mtimeMs;
    return {
      done: fields.done ?? "",
      next: fields.next ?? "",
      tests: fields.tests ?? "",
      todos: fields.todos ?? "",
      health: fields.health ?? "",
      mtime,
    };
  } catch {
    return null;
  }
}

function parseGit(dir: string): GitState | null {
  if (!fs.existsSync(dir)) return null;
  try {
    const branch = execSync("git branch --show-current", { cwd: dir, timeout: 3000 }).toString().trim();
    const log = execSync("git log -1 --format=%ar|%s", { cwd: dir, timeout: 3000 }).toString().trim();
    const dirty = execSync("git status --porcelain", { cwd: dir, timeout: 3000 }).toString().trim();
    const todayRaw = execSync("git log --since=midnight --format=%H", { cwd: dir, timeout: 3000 }).toString().trim();
    const [when = "", msg = ""] = log.split("|");
    return {
      branch,
      lastMsg: msg.slice(0, 80),
      lastWhen: when,
      dirty: dirty.length > 0,
      todayCount: todayRaw ? todayRaw.split("\n").filter(Boolean).length : 0,
    };
  } catch {
    return null;
  }
}


function readPromptMeta(): PromptMeta[] {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, "utf-8"));
  } catch {
    return [];
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const projects = parseProjects();
  const prompts = readPromptMeta();

  const states: ProjectState[] = projects.map(({ tab, dir }) => {
    const readTs = (filename: string): number | null => {
      try {
        if (fs.existsSync(filename)) {
          const ts = parseInt(fs.readFileSync(filename, "utf-8").trim(), 10);
          return isNaN(ts) ? null : ts;
        }
      } catch { /* ignore */ }
      return null;
    };
    const readyAt = readTs(path.join("/tmp", `claude-ready-${tab}`));
    const closedAt = readTs(path.join("/tmp", `claude-closed-${tab}`));
    return { tab, dir, session: parseSession(tab), git: parseGit(dir), claudeRunning: false, readyAt, closedAt };
  });

  // Single pgrep call to detect if any claude process is running
  let claudePids: string[] = [];
  try {
    claudePids = execSync("pgrep -f 'claude' 2>/dev/null || true", { timeout: 2000 })
      .toString().trim().split("\n").filter(Boolean);
  } catch { /* ignore */ }

  if (claudePids.length > 0) {
    // Check each project directory against running claude process CWDs
    for (const state of states) {
      try {
        for (const pid of claudePids) {
          const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
          if (cwd === state.dir || cwd.startsWith(state.dir + "/")) {
            state.claudeRunning = true;
            break;
          }
        }
      } catch { /* process may have died */ }
    }
  }

  return NextResponse.json({ projects: states, prompts } satisfies ControlData);
}
