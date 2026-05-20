import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { getZellijTabs, shellEscape } from "@/lib/zellij";
import { getProjects, type ProjectRow } from "@/db/queries/projects";
import { createOrchestrationEvent, getLatestEventsByProjectKeys } from "@/db/queries/orchestration-events";
import { getLatestRunsByProjectPaths, getRecentOutcomesByProjectKeys, cleanupStaleOrchestrationRuns } from "@/db/queries/orchestration-runs";
import { getRecentCustomPromptsByProjectKeys, getRecentActivity, type RecentCustomPrompt, type ActivityItem } from "@/db/queries/prompt-history";
import { getProjectStatesByUserId, getProjectStatesByUserIds, upsertProjectState } from "@/db/queries/project-states";
import type { ProjectState as DbProjectState } from "@/db/schema/project-states";
import { appendProjectDevLog, appendProjectDevLogByEntityProjectId, ensureUserProjectEntityLinks, getOrgProjects } from "@/db/queries/user-projects";
import { readAgentPreferences, resolveAgentConfig } from "@/lib/agent-preferences";
import { buildSwitchableAgentCatalog, type AgentCatalog } from "@/lib/agent-catalog";
import {
  stateFile,
  resolveEffectiveTab,
  readPromptMeta,
  type PromptMeta,
} from "@/lib/agent-config";
import {
  parseSession,
  readTmpTs,
  readCurrentPrompt,
  getAgentProcesses,
} from "@/lib/control-fast-state";
import { collectRuntimeLifecycleEvents, deriveLifecycleState, shouldPersistLifecycleEvent } from "@/lib/orchestration";
import { getSessionUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import type { ProjectProfile, CurrentPrompt, ProjectState, SessionState, GitState, ControlData, FailedCommand } from "@/lib/control-types";
import { getRecentFailedCommands } from "@/db/queries/pending-commands";

export type { ProjectProfile, CurrentPrompt, ProjectState, SessionState, GitState, ControlData, FailedCommand };
export type { PromptMeta, ActivityItem };

const execAsync = promisify(exec);

// ── Slow-data cache (git + DB) ────────────────────────────────────────────────
// git state and DB profiles change infrequently; PIDs/session/tmp files are always read fresh.
// Stale-while-revalidate: return cached data immediately, refresh asynchronously when stale.

type SlowCache = {
  gitMap: Map<string, GitState>;
  zellijTabs: string[];
  dirs: string[];        // dirs list used to build this cache
  builtAt: number;
};

let slowCache: SlowCache | null = null;
let cacheRefreshing = false;
const CACHE_TTL_MS = 20_000; // 20s — stale after one 10s poll misses, triggers refresh

async function buildSlowData(userId: string, dirs: string[]): Promise<SlowCache> {
  const [gitMap, zellijTabsLocal, dbStates] = await Promise.all([
    fetchAllGitStates(dirs),
    isRuntimeAvailable() ? getZellijTabs() : Promise.resolve([] as string[]),
    isRuntimeAvailable() ? Promise.resolve([] as DbProjectState[]) : getProjectStatesByUserId(userId).catch((e): DbProjectState[] => { console.error("[control/slowData] projectStates failed:", e); return []; }),
  ]);
  // On Vercel, zellijTabs comes from the daemon-pushed tabOpen field in project_states.
  // Locally, getZellijTabs() reads from the live Zellij process.
  const zellijTabs = isRuntimeAvailable()
    ? zellijTabsLocal
    : dbStates.filter((s) => s.tabOpen).map((s) => s.tabName);
  return { gitMap, zellijTabs, dirs, builtAt: Date.now() };
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
      buildSlowData(userId, dirs).then((fresh) => { slowCache = fresh; cacheRefreshing = false; }).catch((e) => { console.error("[control/cache] background refresh failed:", e); cacheRefreshing = false; });
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

  const dirArgs = dirs.map(shellEscape).join(" ");
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
        dirtyCount: parseInt(dirtyStr ?? "0", 10),
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

function rowToProfile(match: ProjectRow): ProjectProfile {
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

function matchProfile(
  tab: string,
  dir: string,
  dbProjects: ProjectRow[]
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
  return match ? rowToProfile(match) : null;
}

function matchProfileById(
  entityProjectId: string | null,
  dbProjects: ProjectRow[],
): ProjectProfile | null {
  if (!entityProjectId) return null;
  const match = dbProjects.find((p) => p.id === entityProjectId);
  return match ? rowToProfile(match) : null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const preferences = readAgentPreferences();
  const agentConfig = resolveAgentConfig(preferences);
  const agentRegistry: AgentCatalog = buildSwitchableAgentCatalog(preferences.models, agentConfig.agent);
  const prompts = readPromptMeta();

  // Own projects + team projects (org peers). Own take precedence on tab-name collision.
  const [dbUserProjects, dbTeamProjects] = await Promise.all([
    ensureUserProjectEntityLinks(userId).catch((e) => { console.error("[control/GET] ensureUserProjectEntityLinks failed:", e); return []; }),
    getOrgProjects(userId).catch((e) => { console.error("[control/GET] getOrgProjects failed:", e); return []; }),
  ]);

  const seenTabs = new Set<string>();
  const toEntry = (p: (typeof dbUserProjects)[number]) => ({
    id: p.id, projectId: p.entityProjectId ?? null, tab: p.name,
    dir: p.dirPath!, agentPref: p.agentPref ?? null, modelPref: p.modelPref ?? null,
    ownerUserId: p.userId,
    readonly: false as boolean,
  });
  const ownEntries = dbUserProjects.filter((p) => p.dirPath).map(toEntry)
    .filter((p) => { if (seenTabs.has(p.tab.toLowerCase())) return false; seenTabs.add(p.tab.toLowerCase()); return true; });
  const teamEntries = dbTeamProjects.filter((p) => p.dirPath).map((p) => ({ ...toEntry(p), readonly: true }))
    .filter((p) => { if (seenTabs.has(p.tab.toLowerCase())) return false; seenTabs.add(p.tab.toLowerCase()); return true; });
  const projects = [...ownEntries, ...teamEntries];
  const dirs = projects.map((p) => p.dir);

  // Slow data (git + DB) served from cache — no fork needed for CWD check
  const { gitMap, zellijTabs } = await getSlowData(userId, dirs);
  // Detect any known agent running in a project dir — not just the configured default
  const agentProcesses = getAgentProcesses(agentRegistry.agents);
  const projectKeys = projects.map((p) => p.tab);

  // Fetch DB states for own user + all team project owners so session progress is visible.
  const teamOwnerIds = [...new Set(dbTeamProjects.map((p) => p.userId))];
  const allOwnerIds = [userId, ...teamOwnerIds];
  const [latestRuns, recentPromptsMap, recentOutcomesMap, recentActivity, dbStatesArr, latestLifecycleEvents, effectiveDbProjects, failedCommands] = await Promise.all([
    getLatestRunsByProjectPaths(userId, dirs),
    getRecentCustomPromptsByProjectKeys(userId, projectKeys).catch((e) => { console.error("[control/GET] recentPromptsMap failed:", e); return new Map<string, RecentCustomPrompt[]>(); }),
    getRecentOutcomesByProjectKeys(userId, projectKeys, 5).catch((e) => { console.error("[control/GET] recentOutcomesMap failed:", e); return new Map<string, import("@/db/schema/orchestration-runs").OrchestrationOutcome[]>(); }),
    getRecentActivity(userId, 24, Math.max(30, projectKeys.length * 5)).catch((e): ActivityItem[] => { console.error("[control/GET] recentActivity failed:", e); return []; }),
    // Single batch query instead of N per-owner queries
    getProjectStatesByUserIds(allOwnerIds).catch((e): DbProjectState[] => { console.error("[control/GET] projectStates failed:", e); return []; }),
    getLatestEventsByProjectKeys(userId, projectKeys, ["input_requested", "close_requested", "session_closed", "task_started"])
      .catch((e) => { console.error("[control/GET] lifecycleEvents failed:", e); return new Map(); }),
    // Fetch own + team owners' entity projects per-request (not cached) so each user
    // always sees their own profile data regardless of who last built the git cache.
    Promise.all(allOwnerIds.map((oid) => getProjects(oid).catch((e) => { console.error("[control/GET] getProjects failed for", oid, e); return [] as ProjectRow[]; }))).then((arrs) => arrs.flat()),
    getRecentFailedCommands([userId]).catch((e): FailedCommand[] => { console.error("[control/GET] failedCommands failed:", e); return []; }),
  ]);
  cleanupStaleOrchestrationRuns(userId).catch((err) => console.error("[control] cleanup failed:", err))
  // Key by (ownerUserId, projectKey) — two users in the same org may both have a
  // project named "cockpit", and we want each card to read its own owner's row.
  const dbStateMap = new Map(dbStatesArr.map((s) => [`${s.userId}:${s.projectKey.toLowerCase()}`, s]));

  // Group recent activity by project key so each card gets its own slice (no extra query).
  const activityByProject = new Map<string, typeof recentActivity>();
  for (const item of recentActivity) {
    const arr = activityByProject.get(item.projectKey) ?? [];
    if (arr.length < 5) arr.push(item);
    activityByProject.set(item.projectKey, arr);
  }

  const states: ProjectState[] = projects.map(({ id, projectId, tab, dir, agentPref, modelPref, ownerUserId, readonly }) => {
    const latestRun = latestRuns.get(dir);
    const dbState = dbStateMap.get(`${ownerUserId}:${tab.toLowerCase()}`);

    // Resolve live Zellij tab first — session files and /tmp sentinels all use the live name.
    // e.g. canonical "Cockpit" may run as "Cockpit Claude", so sessions/Cockpit Claude.md wins.
    const liveTab = resolveEffectiveTab(tab, zellijTabs);
    const session = parseSession(liveTab);

    // Mirror DB-backed prompt queue → /tmp/agent-queue-<tab> on local
    // cockpit-app boxes ONLY (runtime present means we're on the user's
    // machine, not Vercel). Closes the drift home/'s /control queue
    // badge surfaces: when the queue is PUT to Vercel, the /tmp mirror
    // on Vercel goes nowhere, so the local /tmp stays stale even though
    // Neon has the truth. Refreshing on every /api/control GET keeps the
    // local file in sync while the UI is open — long enough that home/
    // and the bash hook (agent-hook-bridge.sh:413,607) see fresh queue
    // data.
    if (!readonly && isRuntimeAvailable() && dbState?.promptQueue) {
      try {
        const p = stateFile.queue(tab.toLowerCase());
        fs.writeFileSync(p + ".tmp", JSON.stringify(dbState.promptQueue));
        fs.renameSync(p + ".tmp", p);
      } catch { /* mirror failure is non-fatal — DB is source of truth */ }
    }

    // Only the project's owner writes to project_states. A viewer reading a team
    // (readonly) project's session would otherwise create a row under their own
    // userId, which would never be queried again and would drift from the owner's.
    if (!readonly && session && dbState) {
      const sessionMtimeMs = session.mtime;
      const dbSessionMs = dbState.sessionUpdatedAt?.getTime() ?? 0;
      if (sessionMtimeMs > dbSessionMs) {
        upsertProjectState({
          projectKey: tab,
          projectId,
          userId: ownerUserId,
          tabName: liveTab,
          sessionStatus: session.status,
          sessionDone:   session.done,
          sessionNext:   session.next,
          sessionTests:  session.tests,
          sessionTodos:  session.todos,
          sessionHealth: session.health,
          sessionUpdatedAt: new Date(sessionMtimeMs),
        }).catch((err) => console.error("[control] upsertProjectState failed:", err));

        // Capture agent progress to dev log when the "done" section actually changes.
        // Creates a natural timeline of what each agent accomplished without requiring
        // the beacon popup — covers auto-continue, direct injections, and all flows.
        const doneTrimmed = session.done?.trim();
        if (doneTrimmed && doneTrimmed !== dbState.sessionDone?.trim()) {
          const entry = {
            date: new Date(sessionMtimeMs).toISOString(),
            done: doneTrimmed,
            next: session.next?.trim() ?? "",
            tests: session.tests?.trim() ?? "",
            todos: session.todos?.trim() ?? "",
            health: session.health?.trim() || "good",
          };
          if (projectId) appendProjectDevLogByEntityProjectId(ownerUserId, projectId, entry).catch((err) => console.error("[control] devlog append failed:", err));
          else appendProjectDevLog(ownerUserId, tab, entry).catch((err) => console.error("[control] devlog append failed:", err));
        }
      }
    } else if (!readonly && session && !dbState) {
      // First time we're seeing this project's session — bootstrap the DB row
      upsertProjectState({
        projectKey: tab,
        projectId,
        userId: ownerUserId,
        tabName: liveTab,
        sessionDone:   session.done,
        sessionNext:   session.next,
        sessionTests:  session.tests,
        sessionTodos:  session.todos,
        sessionHealth: session.health,
        sessionUpdatedAt: new Date(session.mtime),
      }).catch((err) => console.error("[control] upsertProjectState failed:", err));
    }

    const nowS = Math.floor(Date.now() / 1000);
    const tmpReady   = readTmpTs(stateFile.ready(liveTab));
    const tmpLock    = readTmpTs(stateFile.lock(liveTab));
    const tmpClosing = readTmpTs(stateFile.closing(liveTab));
    const tmpClosed  = readTmpTs(stateFile.closed(liveTab));

    const projectAgentId = agentPref ?? agentConfig.agent;
    const projectAgent = agentRegistry.agents.find((entry) => entry.id === projectAgentId);
    const projectProcesses = agentProcesses.filter((process) => process.cwd === dir || process.cwd.startsWith(dir + "/"));
    // On Vercel (no /proc access) fall back to daemon-pushed DB state so the control
    // panel reflects live agent activity on the home machine.
    const runtimeAvailable = isRuntimeAvailable();
    const agentRunning = runtimeAvailable
      ? projectProcesses.length > 0
      : (dbState?.agentRunning ?? false);
    const activeAgents = runtimeAvailable
      ? [...new Set(projectProcesses.map((process) => process.agentId))]
      : (dbState?.activeAgents ?? []);
    const sessionLifecycleSignals = projectProcesses.length > 0
      ? projectProcesses.some((process) => process.sessionLifecycleSignals)
      : projectAgent?.capabilities.sessionLifecycleSignals ?? false;

    // currentPrompt: on local machine, /tmp file is authoritative (DB fallback would
    // show stale tasks after reboot). On Vercel, daemon keeps DB current so use DB.
    const rawCurrentPrompt: CurrentPrompt | null = runtimeAvailable
      ? readCurrentPrompt(liveTab)
      : (dbState?.currentPromptKey && dbState?.currentPromptLabel && dbState?.currentPromptStartedAt)
        ? {
            key: dbState.currentPromptKey,
            label: dbState.currentPromptLabel,
            startedAt: Math.floor(dbState.currentPromptStartedAt.getTime() / 1000),
            source: "inject" as const,
          }
        : null;
    // Agents without lifecycle callbacks, notably an interactive Codex TUI, can stay
    // alive after returning to the prompt. Direct injections into those sessions have
    // no reliable completion signal, so do not render their last injected text as an
    // active task forever. One-shot runners set source:"runner" and are cleared by
    // agent-hook-bridge.sh when they finish.
    const currentPrompt: CurrentPrompt | null =
      sessionLifecycleSignals || rawCurrentPrompt?.source === "runner"
        ? rawCurrentPrompt
        : null;

    const lifecycleEvents = latestLifecycleEvents.get(tab);
    const derivedLifecycle = deriveLifecycleState({
      runtime: {
        readyAt: tmpReady,
        lockAt: tmpLock,
        closingAt: tmpClosing,
        closedAt: tmpClosed,
        currentPromptStartedAt: currentPrompt?.startedAt ?? null,
      },
      events: lifecycleEvents,
      dbState,
      nowS,
    });

    for (const event of collectRuntimeLifecycleEvents({
      readyAt: tmpReady,
      lockAt: tmpLock,
      closingAt: tmpClosing,
      closedAt: tmpClosed,
      currentPromptStartedAt: currentPrompt?.startedAt ?? null,
    })) {
      if (!shouldPersistLifecycleEvent(event, lifecycleEvents)) continue;
      createOrchestrationEvent({
        userId,
        projectKey: tab,
        eventType: event.type,
        source: event.source,
        detail: event.detail,
        happenedAt: new Date(event.at * 1000),
      }).catch((err) => console.error("[control] createOrchestrationEvent failed:", err));
    }

    return ({
    id,
    projectId,
    tab,
    liveTab,
    dir,
    agentPref,
    modelPref,
    session,
    git: gitMap.get(dir) ?? null,
    sessionLifecycleSignals,
    agentRunning,
    activeAgents,
    profile: matchProfileById(projectId, effectiveDbProjects) ?? matchProfile(tab, dir, effectiveDbProjects),
    currentPrompt,
    readyAt:   derivedLifecycle.readyAt,
    lockAt:    derivedLifecycle.lockAt,
    closingAt: derivedLifecycle.closingAt,
    closedAt:  derivedLifecycle.closedAt,
    recentCustomPrompts: recentPromptsMap.get(tab) ?? [],
    recentInjections: activityByProject.get(tab) ?? [],
    recentOutcomes: recentOutcomesMap.get(tab) ?? [],
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
    inventory: {
      source: "user_projects",
      trackedProjectCount: dbUserProjects.length,
      controlProjectCount: projects.length,
      linkedDirectoryCount: dbUserProjects.filter((project) => Boolean(project.dirPath)).length,
    },
    projects: states,
    prompts,
    zellijTabs,
    recentActivity: recentActivity ?? [],
    runtimeAvailable: isRuntimeAvailable(),
    daemonLastPushedAt: !isRuntimeAvailable() && dbStatesArr.length > 0
      ? dbStatesArr.reduce((max, s) => s.updatedAt > max ? s.updatedAt : max, dbStatesArr[0].updatedAt).toISOString()
      : null,
    failedCommands: failedCommands ?? [],
  } satisfies ControlData);
}
