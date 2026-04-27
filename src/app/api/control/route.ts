import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

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

async function parseGit(dir: string): Promise<GitState | null> {
  if (!fs.existsSync(dir)) return null;
  try {
    // Run all 4 git queries in parallel — each is independent
    const [branchResult, logResult, dirtyResult, todayResult] = await Promise.all([
      execAsync("git branch --show-current", { cwd: dir, timeout: 3000 }),
      execAsync("git log -1 --format=%ar|%s", { cwd: dir, timeout: 3000 }),
      execAsync("git status --porcelain", { cwd: dir, timeout: 3000 }),
      execAsync("git log --since=midnight --format=%H", { cwd: dir, timeout: 3000 }),
    ]);
    const log = logResult.stdout.trim();
    const [when = "", msg = ""] = log.split("|");
    const todayRaw = todayResult.stdout.trim();
    return {
      branch: branchResult.stdout.trim(),
      lastMsg: msg.slice(0, 80),
      lastWhen: when,
      dirty: dirtyResult.stdout.trim().length > 0,
      todayCount: todayRaw ? todayRaw.split("\n").filter(Boolean).length : 0,
    };
  } catch {
    return null;
  }
}

function readTmpTs(filename: string): number | null {
  try {
    if (fs.existsSync(filename)) {
      const ts = parseInt(fs.readFileSync(filename, "utf-8").trim(), 10);
      return isNaN(ts) ? null : ts;
    }
  } catch { /* ignore */ }
  return null;
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

  // Resolve all project states in parallel — no more sequential execSync blocking
  const [states, claudePidsRaw] = await Promise.all([
    Promise.all(
      projects.map(async ({ tab, dir }) => ({
        tab,
        dir,
        session: parseSession(tab),
        git: await parseGit(dir),
        claudeRunning: false, // populated below
        readyAt: readTmpTs(path.join("/tmp", `claude-ready-${tab}`)),
        closedAt: readTmpTs(path.join("/tmp", `claude-closed-${tab}`)),
      }))
    ),
    // Single pgrep call runs in parallel with git operations
    execAsync("pgrep -f 'claude' 2>/dev/null || true", { timeout: 2000 })
      .then((r) => r.stdout.trim().split("\n").filter(Boolean))
      .catch(() => [] as string[]),
  ]);

  // Map each claude PID's cwd to the matching project
  for (const state of states) {
    for (const pid of claudePidsRaw) {
      try {
        const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
        if (cwd === state.dir || cwd.startsWith(state.dir + "/")) {
          state.claudeRunning = true;
          break;
        }
      } catch { /* process may have died */ }
    }
  }

  return NextResponse.json({ projects: states, prompts } satisfies ControlData);
}
