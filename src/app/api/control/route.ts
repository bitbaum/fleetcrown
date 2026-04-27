import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { getProjects } from "@/db/queries/projects";

const execAsync = promisify(exec);

const HOME = process.env.HOME ?? "/home/g";
const PROJECTS_CONF = path.join(HOME, ".config", "claude-projects.conf");
const SESSIONS_DIR = path.join(HOME, ".claude", "sessions");
const META_FILE = path.join(HOME, ".config", "claude-prompts-meta.json");

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProjectProfile = {
  description: string;
  status: string;
  maturity: string;
  stack: string;
  url: string;
  mission: string;
  attrs: Record<string, string>;
};

export type CurrentPrompt = {
  key: string;
  label: string;
  startedAt: number;
};

export type ProjectState = {
  tab: string;
  dir: string;
  session: SessionState | null;
  git: GitState | null;
  claudeRunning: boolean;
  profile: ProjectProfile | null;
  currentPrompt: CurrentPrompt | null;
  /** Unix seconds — set when Claude just finished, cleared by /api/inject */
  readyAt: number | null;
  /** Unix seconds — close_session prompt is currently running (not yet finished) */
  closingAt: number | null;
  /** Unix seconds — close_session prompt finished; shows celebration UI */
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

// Single bash invocation for ALL projects — avoids N×fork() overhead in the heavy Next.js process.
// Each fork() blocks the event loop for ~800ms; one batch script with background jobs costs 1 fork.
// All repos are queried in parallel (bash background jobs), output collected via wait.
// Output: one line per project: "<dir>\t<branch>\t<lastWhen>|<msg>\t<dirtyCount>\t<todayCount>"
async function fetchAllGitStates(
  dirs: string[]
): Promise<Map<string, GitState>> {
  if (dirs.length === 0) return new Map();

  // Build a bash function + parallel invocation. Background jobs run all repos simultaneously.
  const dirArgs = dirs.map((d) => `'${d}'`).join(" ");
  const script = `
_git_row() {
  local d="$1"
  [ -d "$d/.git" ] || return
  local b l di t
  b=$(git -C "$d" branch --show-current 2>/dev/null)
  l=$(git -C "$d" log -1 '--format=%ar|%s' 2>/dev/null)
  di=$(git -C "$d" status --porcelain 2>/dev/null | wc -l)
  t=$(git -C "$d" log --since=midnight --format=%H 2>/dev/null | wc -l)
  printf '%s\\t%s\\t%s\\t%s\\t%s\\n' "$d" "$b" "$l" "$di" "$t"
}
for _d in ${dirArgs}; do _git_row "$_d" & done
wait
`;

  const result = new Map<string, GitState>();
  try {
    const { stdout } = await execAsync(`bash -c '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const [dir, branch, logStr, dirtyStr, todayStr] = line.split("\t");
      if (!dir || !branch) continue;
      const [when = "", msg = ""] = (logStr ?? "").split("|");
      result.set(dir, {
        branch: branch.trim(),
        lastMsg: msg.slice(0, 80),
        lastWhen: when.trim(),
        dirty: parseInt(dirtyStr ?? "0", 10) > 0,
        todayCount: parseInt(todayStr ?? "0", 10),
      });
    }
  } catch {
    // git queries failed — return empty map, projects will show null git state
  }
  return result;
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

function readCurrentPrompt(tab: string): CurrentPrompt | null {
  try {
    const file = path.join("/tmp", `claude-current-prompt-${tab}`);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
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

// ── Profile matching ──────────────────────────────────────────────────────────

// Match a tab name to a DB project entity using fuzzy name comparison.
// Handles: "AOZ" → "aoz-housing", "Ivy" → "ivy-portal", "OrangeCat" → "orangecat"
function matchProfile(
  tab: string,
  dir: string,
  dbProjects: Awaited<ReturnType<typeof getProjects>>
): ProjectProfile | null {
  const tabLower = tab.toLowerCase().replace(/[-_]/g, "");
  const dirBaseLower = path.basename(dir).toLowerCase().replace(/[-_]/g, "");

  const match = dbProjects.find((p) => {
    const nameLower = p.name.toLowerCase().replace(/[-_]/g, "");
    return (
      nameLower === tabLower ||
      nameLower === dirBaseLower ||
      nameLower.includes(tabLower) ||
      tabLower.includes(nameLower) ||
      nameLower.includes(dirBaseLower) ||
      dirBaseLower.includes(nameLower)
    );
  });

  if (!match) return null;
  const a = match.attrs as Record<string, string>;
  return {
    description: match.description ?? a.description ?? "",
    status: a.status ?? "",
    maturity: a.maturity ?? "",
    stack: a.stack ?? a.stack_layer ?? "",
    url: a.url ?? "",
    mission: a.mission ?? "",
    attrs: a,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const projects = parseProjects();
  const prompts = readPromptMeta();
  const dirs = projects.map((p) => p.dir);

  // Run all IO in parallel: git queries + claude pids + DB project profiles
  const [gitMap, claudePidsRaw, dbProjects] = await Promise.all([
    fetchAllGitStates(dirs),
    execAsync("pgrep -f 'claude' 2>/dev/null || true", { timeout: 2000 })
      .then((r) => r.stdout.trim().split("\n").filter(Boolean))
      .catch(() => [] as string[]),
    getProjects().catch(() => [] as Awaited<ReturnType<typeof getProjects>>),
  ]);

  // Resolve claude PID → cwd once, then match against project dirs
  const claudeCwds = claudePidsRaw.flatMap((pid) => {
    try { return [fs.readlinkSync(`/proc/${pid}/cwd`)]; } catch { return []; }
  });

  const states: ProjectState[] = projects.map(({ tab, dir }) => ({
    tab,
    dir,
    session: parseSession(tab),
    git: gitMap.get(dir) ?? null,
    claudeRunning: claudeCwds.some((cwd) => cwd === dir || cwd.startsWith(dir + "/")),
    profile: matchProfile(tab, dir, dbProjects),
    currentPrompt: readCurrentPrompt(tab),
    readyAt: readTmpTs(path.join("/tmp", `claude-ready-${tab}`)),
    closingAt: readTmpTs(path.join("/tmp", `claude-closing-${tab}`)),
    closedAt: readTmpTs(path.join("/tmp", `claude-closed-${tab}`)),
  }));

  return NextResponse.json({ projects: states, prompts } satisfies ControlData);
}
