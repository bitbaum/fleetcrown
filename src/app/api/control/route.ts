import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { getProjects } from "@/db/queries/projects";
import { getLatestRunsByProjectPaths, cleanupStaleOrchestrationRuns } from "@/db/queries/orchestration-runs";
import { getRecentCustomPromptsByProjectKeys, getRecentActivity, type RecentCustomPrompt, type ActivityItem } from "@/db/queries/prompt-history";
import { getProjectStatesByUserId, upsertProjectState } from "@/db/queries/project-states";
import type { ProjectState as DbProjectState } from "@/db/schema/project-states";
import { getUserProjects } from "@/db/queries/user-projects";
import { readAgentPreferences, resolveAgentConfig } from "@/lib/agent-preferences";
import { buildSwitchableAgentCatalog, type AgentCatalog, type SwitchableAgent } from "@/lib/agent-catalog";
import {
  stateFile,
  parseProjectsConf,
  readPromptMeta,
  type PromptMeta,
} from "@/lib/claude-config";
import {
  parseSession,
  readTmpTs,
  readCurrentPrompt,
  getAgentCwds,
} from "@/lib/control-fast-state";
import { getCurrentUserId } from "@/lib/session";

// Re-export so the ControlPanel can import PromptMeta from this route file (its existing import path).
export type { PromptMeta, ActivityItem };

const execAsync = promisify(exec);

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
  recentCustomPrompts: RecentCustomPrompt[];
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
  /** Commits the remote is ahead of local HEAD (0 = in sync, requires fetch) */
  behindRemote: number;
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
  recentActivity: ActivityItem[];
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

async function buildSlowData(userId: string, dirs: string[]): Promise<SlowCache> {
  const [gitMap, dbProjects, zellijTabs] = await Promise.all([
    fetchAllGitStates(dirs),
    getProjects(userId).catch(() => [] as Awaited<ReturnType<typeof getProjects>>),
    getZellijTabs(),
  ]);
  return { gitMap, dbProjects, zellijTabs, dirs, builtAt: Date.now() };
}

async function getSlowData(userId: string, dirs: string[]): Promise<SlowCache> {
  const now = Date.now();
  const dirsKey = [...dirs].sort().join(",");

  // Cache hit — return immediately, maybe kick off background refresh
  if (slowCache && [...slowCache.dirs].sort().join(",") === dirsKey) {
    if (now - slowCache.builtAt < CACHE_TTL_MS) return slowCache;
    // Stale: return stale immediately, refresh in background
    if (!cacheRefreshing) {
      cacheRefreshing = true;
      buildSlowData(userId, dirs).then((fresh) => { slowCache = fresh; cacheRefreshing = false; }).catch(() => { cacheRefreshing = false; });
    }
    return slowCache;
  }

  // Cold cache or dirs changed — must wait for fresh data
  if (!cacheRefreshing) {
    cacheRefreshing = true;
    slowCache = await buildSlowData(userId, dirs);
    cacheRefreshing = false;
  } else if (slowCache) {
    return slowCache; // another request is already building; return whatever we have
  } else {
    slowCache = await buildSlowData(userId, dirs); // blocking: no stale fallback
  }
  return slowCache;
}

// Single bash invocation — one fork() total. Background jobs run all repos in parallel.
// Fields (tab-separated): dir | branch | lastWhen|lastMsg | dirtyCount | todayCount | behindRemote | recentCommits
// behindRemote: how many commits the upstream has that local doesn't (uses stored FETCH_HEAD, no network)
// recentCommits: last 5 commits joined by ~ ("HASH DATE: MSG~HASH DATE: MSG")
async function fetchAllGitStates(dirs: string[]): Promise<Map<string, GitState>> {
  if (dirs.length === 0) return new Map();

  const dirArgs = dirs.map((d) => `'${d}'`).join(" ");
  const script = `
_git_row() {
  local d="$1"
  [ -d "$d/.git" ] || return
  local b l di t beh h
  b=$(git -C "$d" branch --show-current 2>/dev/null)
  l=$(git -C "$d" log -1 '--format=%ar|%s' 2>/dev/null)
  di=$(git -C "$d" status --porcelain 2>/dev/null | wc -l)
  t=$(git -C "$d" log --since=midnight --format=%H 2>/dev/null | wc -l)
  beh=$(git -C "$d" rev-list HEAD..@{u} --count 2>/dev/null || echo 0)
  h=$(git -C "$d" log -5 '--format=%h %ar: %s' 2>/dev/null | tr '~' '-' | paste -sd '~' -)
  printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$d" "$b" "$l" "$di" "$t" "$beh" "$h"
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
      const [dir, branch, logStr, dirtyStr, todayStr, behindStr, historyStr] = line.split("\t");
      if (!dir || !branch) continue;
      const [when = "", msg = ""] = (logStr ?? "").split("|");
      const recentCommits = (historyStr ?? "").split("~").map((s) => s.trim()).filter(Boolean);
      result.set(dir, {
        branch: branch.trim(),
        lastMsg: msg.slice(0, 80),
        lastWhen: when.trim(),
        dirty: parseInt(dirtyStr ?? "0", 10) > 0,
        todayCount: parseInt(todayStr ?? "0", 10),
        behindRemote: parseInt(behindStr ?? "0", 10),
        recentCommits,
      });
    }
  } catch {
    // git queries failed — projects show null git state
  }
  return result;
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
  const userId = await getCurrentUserId();
  const preferences = readAgentPreferences();
  const agentConfig = resolveAgentConfig(preferences);
  const agentRegistry: AgentRegistry = buildSwitchableAgentCatalog(preferences.models, agentConfig.agent);
  const prompts = readPromptMeta();

  // DB projects for this user; fall back to conf file for backward compat
  const dbUserProjects = await getUserProjects(userId).catch(() => []);
  const projects = dbUserProjects.length > 0
    ? dbUserProjects
        .filter((p) => p.dirPath)
        .map((p) => ({ tab: p.name, dir: p.dirPath! }))
    : parseProjectsConf();
  const dirs = projects.map((p) => p.dir);

  // Slow data (git + DB) served from cache — no fork needed for CWD check
  const { gitMap, dbProjects, zellijTabs } = await getSlowData(userId, dirs);
  // Detect any known agent running in a project dir — not just the configured default
  const allMatchers = agentRegistry.agents.flatMap((entry) => entry.processMatchers);
  const agentCwds = getAgentCwds(allMatchers);
  const projectKeys = projects.map((p) => p.tab);
  const [latestRuns, recentPromptsMap, recentActivity, dbStatesArr] = await Promise.all([
    getLatestRunsByProjectPaths(userId, dirs),
    getRecentCustomPromptsByProjectKeys(userId, projectKeys).catch(() => new Map<string, RecentCustomPrompt[]>()),
    getRecentActivity(userId, 24, 30).catch((): ActivityItem[] => []),
    getProjectStatesByUserId(userId).catch((): DbProjectState[] => []),
    cleanupStaleOrchestrationRuns(userId).catch(() => {}),
  ]);
  const dbStateMap = new Map(dbStatesArr.map((s) => [s.projectKey.toLowerCase(), s]));
  // 24-hour window: DB ready/closing/closed timestamps older than this are not surfaced
  const READY_WINDOW_S = 86400;

  const states: ProjectState[] = projects.map(({ tab, dir }) => {
    const latestRun = latestRuns.get(dir);
    const dbState = dbStateMap.get(tab.toLowerCase());
    const session = parseSession(tab);

    // Persist session to DB if it's newer than what DB has (fire-and-forget)
    if (session && dbState) {
      const sessionMtimeMs = session.mtime;
      const dbSessionMs = dbState.sessionUpdatedAt?.getTime() ?? 0;
      if (sessionMtimeMs > dbSessionMs) {
        upsertProjectState({
          projectKey: tab,
          userId,
          tabName: tab,
          sessionDone:   session.done,
          sessionNext:   session.next,
          sessionTests:  session.tests,
          sessionTodos:  session.todos,
          sessionHealth: session.health,
          sessionUpdatedAt: new Date(sessionMtimeMs),
        }).catch(() => {});
      }
    } else if (session && !dbState) {
      // First time we're seeing this project's session — bootstrap the DB row
      upsertProjectState({
        projectKey: tab,
        userId,
        tabName: tab,
        sessionDone:   session.done,
        sessionNext:   session.next,
        sessionTests:  session.tests,
        sessionTodos:  session.todos,
        sessionHealth: session.health,
        sessionUpdatedAt: new Date(session.mtime),
      }).catch(() => {});
    }

    const nowS = Math.floor(Date.now() / 1000);
    const tmpReady   = readTmpTs(stateFile.ready(tab));
    const tmpClosing = readTmpTs(stateFile.closing(tab));
    const tmpClosed  = readTmpTs(stateFile.closed(tab));

    // Fall back to DB value when /tmp is empty, but only within the 24-hour window
    const dbReady   = dbState?.readyAt   ? Math.floor(dbState.readyAt.getTime()   / 1000) : null;
    const dbClosing = dbState?.closingAt ? Math.floor(dbState.closingAt.getTime() / 1000) : null;
    const dbClosed  = dbState?.closedAt  ? Math.floor(dbState.closedAt.getTime()  / 1000) : null;

    const resolveTs = (tmp: number | null, db: number | null) =>
      tmp ?? (db !== null && (nowS - db) < READY_WINDOW_S ? db : null);

    const tmpPrompt = readCurrentPrompt(tab);
    const currentPrompt: CurrentPrompt | null = tmpPrompt ?? (dbState?.currentPromptKey ? {
      key:       dbState.currentPromptKey,
      label:     dbState.currentPromptLabel ?? dbState.currentPromptKey,
      startedAt: dbState.currentPromptStartedAt
        ? Math.floor(dbState.currentPromptStartedAt.getTime() / 1000)
        : 0,
    } : null);

    return ({
    tab,
    dir,
    session,
    git: gitMap.get(dir) ?? null,
    agentRunning: agentCwds.some((cwd) => cwd === dir || cwd.startsWith(dir + "/")),
    profile: matchProfile(tab, dir, dbProjects),
    currentPrompt,
    readyAt:   resolveTs(tmpReady,   dbReady),
    closingAt: resolveTs(tmpClosing, dbClosing),
    closedAt:  resolveTs(tmpClosed,  dbClosed),
    recentCustomPrompts: recentPromptsMap.get(tab) ?? [],
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
      manualPromptInjection: true,
      autonomousPromptLoop: true,
      sessionLifecycleSignals: true,
    },
    projects: states,
    prompts,
    zellijTabs,
    recentActivity: recentActivity ?? [],
  } satisfies ControlData);
}
