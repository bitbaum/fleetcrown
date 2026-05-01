import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { getProjects } from "@/db/queries/projects";
import { getLatestRunsByProjectPaths } from "@/db/queries/orchestration-runs";
import { readAgentPreferences, resolveAgentConfig } from "@/lib/agent-preferences";
import { buildSwitchableAgentCatalog, type AgentCatalog, type SwitchableAgent } from "@/lib/agent-catalog";
import {
  SESSIONS_DIR,
  stateFile,
  parseProjectsConf,
  readPromptMeta,
  type PromptMeta,
} from "@/lib/claude-config";

// Re-export so the ControlPanel can import PromptMeta from this route file (its existing import path).
export type { PromptMeta };

const execAsync = promisify(exec);

function getAgentCwds(processMatchers: string[]): string[] {
  const cwds: string[] = [];

  try {
    for (const entry of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf-8");
        if (!processMatchers.some((matcher) => cmdline.includes(matcher))) continue;
        cwds.push(fs.readlinkSync(`/proc/${entry}/cwd`));
      } catch {
        // Ignore processes that disappeared mid-scan.
      }
    }
  } catch {
    // Ignore systems where /proc is unavailable.
  }

  return cwds;
}

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
  agentRunning: boolean;
  profile: ProjectProfile | null;
  currentPrompt: CurrentPrompt | null;
  readyAt: number | null;
  closingAt: number | null;
  closedAt: number | null;
  latestOrchestrationRun: {
    adapter: string;
    intent: string;
    state: string;
    startedAt: string;
    finishedAt: string | null;
    summary: {
      done: string;
      next: string;
      tests: string;
      todos: string;
      health: string;
    } | null;
    payload: {
      resultText?: string;
      error?: string;
      durationMs?: number;
      model?: string;
    } | null;
  } | null;
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
  /** Last 5 commits formatted as "HASH DATE: MESSAGE" */
  recentCommits: string[];
};

type AgentConfig = {
  agent: SwitchableAgent;
  model: string;
};

type AgentRegistry = AgentCatalog;

export type ControlData = {
  agentRegistry: AgentRegistry;
  agentConfig: AgentConfig;
  orchestration: {
    manualPromptInjection: boolean;
    autonomousPromptLoop: boolean;
    sessionLifecycleSignals: boolean;
  };
  projects: ProjectState[];
  prompts: PromptMeta[];
  zellijTabs: string[];
};

// ── Slow-data cache (git + DB) ────────────────────────────────────────────────
// git state and DB profiles change infrequently; PIDs/session/tmp files are always read fresh.
// Stale-while-revalidate: return cached data immediately, refresh asynchronously when stale.

type SlowCache = {
  gitMap: Map<string, GitState>;
  dbProjects: Awaited<ReturnType<typeof getProjects>>;
  zellijTabs: string[];
  dirs: string[];        // dirs list used to build this cache
  builtAt: number;
};

let slowCache: SlowCache | null = null;
let cacheRefreshing = false;
const CACHE_TTL_MS = 20_000; // 20s — stale after one 10s poll misses, triggers refresh

async function getZellijTabs(): Promise<string[]> {
  try {
    const { stdout } = await execAsync("zellij action query-tab-names 2>/dev/null || true", { timeout: 2000 });
    return stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function buildSlowData(dirs: string[]): Promise<SlowCache> {
  const [gitMap, dbProjects, zellijTabs] = await Promise.all([
    fetchAllGitStates(dirs),
    getProjects().catch(() => [] as Awaited<ReturnType<typeof getProjects>>),
    getZellijTabs(),
  ]);
  return { gitMap, dbProjects, zellijTabs, dirs, builtAt: Date.now() };
}

async function getSlowData(dirs: string[]): Promise<SlowCache> {
  const now = Date.now();
  const dirsKey = dirs.join(",");

  // Cache hit — return immediately, maybe kick off background refresh
  if (slowCache && slowCache.dirs.join(",") === dirsKey) {
    if (now - slowCache.builtAt < CACHE_TTL_MS) return slowCache;
    // Stale: return stale immediately, refresh in background
    if (!cacheRefreshing) {
      cacheRefreshing = true;
      buildSlowData(dirs).then((fresh) => { slowCache = fresh; cacheRefreshing = false; }).catch(() => { cacheRefreshing = false; });
    }
    return slowCache;
  }

  // Cold cache or dirs changed — must wait for fresh data
  if (!cacheRefreshing) {
    cacheRefreshing = true;
    slowCache = await buildSlowData(dirs);
    cacheRefreshing = false;
  } else if (slowCache) {
    return slowCache; // another request is already building; return whatever we have
  } else {
    slowCache = await buildSlowData(dirs); // blocking: no stale fallback
  }
  return slowCache;
}

// ── Parsers ───────────────────────────────────────────────────────────────────

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

// Single bash invocation — one fork() total. Background jobs run all repos in parallel.
// Fields (tab-separated): dir | branch | lastWhen|lastMsg | dirtyCount | todayCount | recentCommits
// recentCommits: last 5 commits joined by ~ ("HASH DATE: MSG~HASH DATE: MSG")
async function fetchAllGitStates(dirs: string[]): Promise<Map<string, GitState>> {
  if (dirs.length === 0) return new Map();

  const dirArgs = dirs.map((d) => `'${d}'`).join(" ");
  const script = `
_git_row() {
  local d="$1"
  [ -d "$d/.git" ] || return
  local b l di t h
  b=$(git -C "$d" branch --show-current 2>/dev/null)
  l=$(git -C "$d" log -1 '--format=%ar|%s' 2>/dev/null)
  di=$(git -C "$d" status --porcelain 2>/dev/null | wc -l)
  t=$(git -C "$d" log --since=midnight --format=%H 2>/dev/null | wc -l)
  h=$(git -C "$d" log -5 '--format=%h %ar: %s' 2>/dev/null | tr '~' '-' | paste -sd '~' -)
  printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$d" "$b" "$l" "$di" "$t" "$h"
}
for _d in ${dirArgs}; do _git_row "$_d" & done
wait
`;

  const result = new Map<string, GitState>();
  try {
    const { stdout } = await execAsync(`bash -c '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    });
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const [dir, branch, logStr, dirtyStr, todayStr, historyStr] = line.split("\t");
      if (!dir || !branch) continue;
      const [when = "", msg = ""] = (logStr ?? "").split("|");
      const recentCommits = (historyStr ?? "").split("~").map((s) => s.trim()).filter(Boolean);
      result.set(dir, {
        branch: branch.trim(),
        lastMsg: msg.slice(0, 80),
        lastWhen: when.trim(),
        dirty: parseInt(dirtyStr ?? "0", 10) > 0,
        todayCount: parseInt(todayStr ?? "0", 10),
        recentCommits,
      });
    }
  } catch {
    // git queries failed — projects show null git state
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
    const file = stateFile.prompt(tab);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8")) as CurrentPrompt;
  } catch { /* ignore */ }
  return null;
}

// ── Profile matching ──────────────────────────────────────────────────────────

function matchProfile(
  tab: string,
  dir: string,
  dbProjects: Awaited<ReturnType<typeof getProjects>>
): ProjectProfile | null {
  const tabLower = tab.toLowerCase().replace(/[-_]/g, "");
  const dirBaseLower = path.basename(dir).toLowerCase().replace(/[-_]/g, "");

  const match = dbProjects.find((p) => {
    const n = p.name.toLowerCase().replace(/[-_]/g, "");
    return (
      n === tabLower || n === dirBaseLower ||
      n.includes(tabLower) || tabLower.includes(n) ||
      n.includes(dirBaseLower) || dirBaseLower.includes(n)
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
  const preferences = readAgentPreferences();
  const agentConfig = resolveAgentConfig(preferences);
  const agentRegistry: AgentRegistry = buildSwitchableAgentCatalog(preferences.models, agentConfig.agent);
  const activeEntry = agentRegistry.agents.find((entry) => entry.id === agentConfig.agent);
  const projects = parseProjectsConf();
  const prompts = readPromptMeta();
  const dirs = projects.map((p) => p.dir);

  // Slow data (git + DB) served from cache — no fork needed for CWD check
  const { gitMap, dbProjects, zellijTabs } = await getSlowData(dirs);
  const agentCwds = getAgentCwds(activeEntry?.processMatchers ?? []);
  const latestRuns = await getLatestRunsByProjectPaths(dirs);

  const states: ProjectState[] = projects.map(({ tab, dir }) => {
    const latestRun = latestRuns.get(dir);
    return ({
    tab,
    dir,
    session: parseSession(tab),
    git: gitMap.get(dir) ?? null,
    agentRunning: agentCwds.some((cwd) => cwd === dir || cwd.startsWith(dir + "/")),
    profile: matchProfile(tab, dir, dbProjects),
    currentPrompt: readCurrentPrompt(tab),
    readyAt: readTmpTs(stateFile.ready(tab)),
    closingAt: readTmpTs(stateFile.closing(tab)),
    closedAt: readTmpTs(stateFile.closed(tab)),
    latestOrchestrationRun: latestRun ? {
      adapter: latestRun.adapter,
      intent: latestRun.intent,
      state: latestRun.state,
      startedAt: latestRun.startedAt?.toISOString?.() ?? String(latestRun.startedAt),
      finishedAt: latestRun.finishedAt ? (latestRun.finishedAt.toISOString?.() ?? String(latestRun.finishedAt)) : null,
      summary: latestRun.summary ?? null,
      payload: latestRun.payload ? {
        resultText: latestRun.payload.resultText,
        error: latestRun.payload.error,
        durationMs: latestRun.payload.durationMs,
        model: latestRun.payload.model,
      } : null,
    } : null,
  });
  });

  return NextResponse.json({
    agentRegistry,
    agentConfig,
    orchestration: {
      manualPromptInjection: activeEntry?.capabilities.manualPromptInjection ?? false,
      autonomousPromptLoop: activeEntry?.capabilities.autonomousPromptLoop ?? false,
      sessionLifecycleSignals: activeEntry?.capabilities.sessionLifecycleSignals ?? false,
    },
    projects: states,
    prompts,
    zellijTabs,
  } satisfies ControlData);
}
