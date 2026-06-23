import { NextResponse } from "next/server";
import { getZellijTabs } from "@/lib/zellij";
import { getProjects, type ProjectRow } from "@/db/queries/projects";
import { createOrchestrationEventOnce, getLatestEventsByProjectKeys } from "@/db/queries/orchestration-events";
import { getLatestRunsByProjectPaths, getRecentOutcomesByProjectKeys, cleanupStaleOrchestrationRuns, updateOrchestrationRun } from "@/db/queries/orchestration-runs";
import { getRecentCustomPromptsByProjectKeys, getRecentActivity, type RecentCustomPrompt, type ActivityItem } from "@/db/queries/prompt-history";
import { getProjectStatesByUserId, getProjectStatesByUserIds, persistProjectSessionIfNewer } from "@/db/queries/project-states";
import type { ProjectState as DbProjectState } from "@/db/schema/project-states";
import { appendProjectDevLog, appendProjectDevLogByEntityProjectId, ensureUserProjectEntityLinks, getOrgProjects } from "@/db/queries/user-projects";
import { readAgentPreferences, resolveAgentConfig } from "@/lib/agent-preferences";
import { buildSwitchableAgentCatalog, type AgentAvailabilityOverride, type AgentCatalog } from "@/lib/agent-catalog";
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
import {
  deriveLifecycleState,
  shouldPersistLifecycleEvent,
  DEFAULT_ADAPTER_ID,
  ORCHESTRATION_ADAPTER_IDS,
  type AdapterId,
} from "@/lib/orchestration";
import { adapterFor } from "@/lib/orchestration/adapter-registry";
// Canonical states/events (ORCHESTRATION_STATES, OrchestrationState, etc.) from
// contract (see debt roadmap Priority 1 + openclaw plan). Raw fast-state (/tmp,
// sessions) and pending-commands are *inputs* / compat only. Derived truth +
// events table should be preferred for new code. This route is being thinned to
// delegate more to lib/orchestration (deriveLifecycleState etc already used).
import { getSessionUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { isAgentId, listAgentRegistry } from "@/lib/agent-registry";
import { inferAdapterFromTabName } from "@/components/control/control-presenter";
import type { ProjectProfile, CurrentPrompt, ProjectState, SessionState, GitState, ControlData, FailedCommand } from "@/lib/control-types";
import { getRecentFailedCommands } from "@/db/queries/pending-commands";
import { getRuntimeSnapshot } from "@/db/queries/runtime-snapshots";
import { writePromptQueueMirror } from "@/lib/prompt-queue-mirror";
import { fetchAllGitStates } from "@/lib/git-state";
import { matchProfile, matchProfileById, resolveAutoInjectOverride } from "@/lib/project-profile-match";
import { resolveProjectSession } from "@/lib/project-session";

export type { ProjectProfile, CurrentPrompt, ProjectState, SessionState, GitState, ControlData, FailedCommand };
export type { PromptMeta, ActivityItem };

// ── Slow-data cache (git + DB) ────────────────────────────────────────────────
// git state and DB profiles change infrequently; PIDs/session/tmp files are always read fresh.
// Stale-while-revalidate: return cached data immediately, refresh asynchronously when stale.

type SlowCache = {
  key: string;
  gitMap: Map<string, GitState>;
  zellijTabs: string[];
  dirs: string[];        // dirs list used to build this cache
  builtAt: number;
  runtimeSnapshotUpdatedAt: Date | null;
  installedAgents: string[];
  runnerVersion: string | null;
};

let slowCache: SlowCache | null = null;
let cacheRefreshing = false;
const CACHE_TTL_MS = 20_000; // 20s — stale after one 10s poll misses, triggers refresh

async function buildSlowData(userId: string, dirs: string[], key: string): Promise<SlowCache> {
  const [gitMap, zellijTabsLocal, dbStates, runtimeSnapshot] = await Promise.all([
    fetchAllGitStates(dirs),
    isRuntimeAvailable() ? getZellijTabs() : Promise.resolve([] as string[]),
    isRuntimeAvailable() ? Promise.resolve([] as DbProjectState[]) : getProjectStatesByUserId(userId).catch((e): DbProjectState[] => { console.error("[control/slowData] projectStates failed:", e); return []; }),
    isRuntimeAvailable() ? Promise.resolve(null) : getRuntimeSnapshot(userId).catch((e) => { console.error("[control/slowData] runtimeSnapshot failed:", e); return null; }),
  ]);
  // Locally: live Zellij query. On cloud: runner-pushed openTabs (full session list),
  // falling back to per-project tabOpen flags from project_states.
  const zellijTabs = isRuntimeAvailable()
    ? zellijTabsLocal
    : (runtimeSnapshot?.openTabs?.length
      ? runtimeSnapshot.openTabs
      : dbStates.filter((s) => s.tabOpen).map((s) => s.tabName));
  return {
    key,
    gitMap,
    zellijTabs,
    dirs,
    builtAt: Date.now(),
    runtimeSnapshotUpdatedAt: runtimeSnapshot?.updatedAt ?? null,
    installedAgents: runtimeSnapshot?.installedAgents ?? [],
    runnerVersion: runtimeSnapshot?.runnerVersion ?? null,
  };
}

async function getSlowData(userId: string, dirs: string[]): Promise<SlowCache> {
  const now = Date.now();
  const dirsKey = [...dirs].sort().join(",");
  const key = `${userId}\0${dirsKey}`;

  // Cache hit — return immediately, maybe kick off background refresh
  if (slowCache?.key === key) {
    if (now - slowCache.builtAt < CACHE_TTL_MS) return slowCache;
    // Stale: return stale immediately, refresh in background
    if (!cacheRefreshing) {
      cacheRefreshing = true;
      buildSlowData(userId, dirs, key).then((fresh) => { slowCache = fresh; cacheRefreshing = false; }).catch((e) => { console.error("[control/cache] background refresh failed:", e); cacheRefreshing = false; });
    }
    return slowCache;
  }

  // Cold cache or a different user/project set: never serve mismatched data.
  slowCache = await buildSlowData(userId, dirs, key);
  return slowCache;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const preferences = readAgentPreferences();
  const agentConfig = resolveAgentConfig(preferences);
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
  const { gitMap, zellijTabs, runtimeSnapshotUpdatedAt, installedAgents, runnerVersion } = await getSlowData(userId, dirs);
  const runtimeAvailable = isRuntimeAvailable();
  // Pull the canonical agent ID list straight from the registry — same source
  // buildSwitchableAgentCatalog reads from one line below. Pre-fix this was
  // a hand-typed array, which silently drifted every time we added an agent
  // to lib/agent-registry until someone happened to grep for it.
  const agentIds = listAgentRegistry().map((entry) => entry.id);
  const runnerAvailability: AgentAvailabilityOverride | undefined = runtimeAvailable
    ? undefined
    : installedAgents.length === 0
      ? Object.fromEntries(agentIds.map((agent) => [agent, true])) as AgentAvailabilityOverride
      : Object.fromEntries(agentIds.map((agent) => [agent, installedAgents.includes(agent)])) as AgentAvailabilityOverride;
  const agentRegistry: AgentCatalog = buildSwitchableAgentCatalog(preferences.models, agentConfig.agent, runnerAvailability);
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
  // project with the same key, and we want each card to read its own owner's row.
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
    // e.g. canonical "FleetCrown" may run as "FleetCrown Claude", so sessions/FleetCrown Claude.md wins.
    const liveTab = resolveEffectiveTab(tab, zellijTabs);
    const projectProcesses = agentProcesses.filter((process) => process.cwd === dir || process.cwd.startsWith(dir + "/"));
    const promptHint = runtimeAvailable ? readCurrentPrompt(liveTab) : null;
    const liveAdapter = projectProcesses[0]?.agentId
      ?? (promptHint?.adapter && isAgentId(promptHint.adapter) ? promptHint.adapter : null)
      ?? inferAdapterFromTabName(liveTab)
      ?? (agentPref && isAgentId(agentPref) ? agentPref : null)
      ?? agentConfig.agent;
    const localSession = runtimeAvailable ? parseSession(liveTab, liveAdapter) : null;
    // File handoff wins, else the persisted project_states row. Shared with the
    // SSE stream via resolveProjectSession so the two paths can't diverge.
    const session = resolveProjectSession(localSession, dbState);

    // The DB is authoritative; the local runtime reads this transport mirror.
    if (!readonly && isRuntimeAvailable() && dbState?.promptQueue) {
      writePromptQueueMirror(tab, dbState.promptQueue);
    }

    // Only the project's owner writes to project_states. A viewer reading a team
    // (readonly) project's session would otherwise create a row under their own
    // userId, which would never be queried again and would drift from the owner's.
    if (!readonly && session && (!dbState || session.mtime > (dbState.sessionUpdatedAt?.getTime() ?? 0))) {
      const sessionMtimeMs = session.mtime;
      persistProjectSessionIfNewer({
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
        sessionBlockReason: session.blockReason,
        sessionNoOpCount:   session.noOpCount,
        sessionUpdatedAt: new Date(sessionMtimeMs),
      }).then((updated) => {
        // Append only for the writer that won the timestamp race.
        const doneTrimmed = session.done?.trim();
        if (updated && dbState && doneTrimmed && doneTrimmed !== dbState.sessionDone?.trim()) {
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
      }).catch((err) => console.error("[control] session state write failed:", err));
    }

    // Resolve the orchestration seam for this project's agent. Claude binds the
    // existing lifecycle/close/enrich hooks (behavior-identical); unregistered
    // adapters yield undefined → neutral fallbacks (no close / no events).
    const adapterId: AdapterId =
      typeof liveAdapter === "string" && (ORCHESTRATION_ADAPTER_IDS as readonly string[]).includes(liveAdapter)
        ? (liveAdapter as AdapterId)
        : DEFAULT_ADAPTER_ID;
    const seam = adapterFor(adapterId);

    // Close an open orchestration run when the agent's handoff reports ready.
    // The local-runtime path has no stop-hook closer since the bash-daemon kill,
    // so the session.md we just read IS the completion signal. Idempotent — only
    // the owner writes, and a run with finishedAt is never re-closed.
    if (!readonly && session && latestRun && !latestRun.finishedAt) {
      const closePatch = seam?.closeRunFromSession?.(latestRun, session) ?? null;
      if (closePatch) {
        updateOrchestrationRun(latestRun.id, closePatch, ownerUserId)
          .catch((err) => console.error("[control] run close failed:", err));
      }
    }

    const nowS = Math.floor(Date.now() / 1000);
    const tmpReady   = readTmpTs(stateFile.ready(liveTab));
    const tmpLock    = readTmpTs(stateFile.lock(liveTab));
    const tmpClosing = readTmpTs(stateFile.closing(liveTab));
    const tmpClosed  = readTmpTs(stateFile.closed(liveTab));

    const projectAgentId = agentPref ?? agentConfig.agent;
    const projectAgent = agentRegistry.agents.find((entry) => entry.id === projectAgentId);
    // On the cloud host (no /proc access) fall back to runner-pushed DB state so the control
    // panel reflects live agent activity on the home machine.
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
    // show stale tasks after reboot). On the cloud host, runner keeps DB current so use DB.
    const rawCurrentPrompt: CurrentPrompt | null = runtimeAvailable
      ? promptHint
      : (dbState?.currentPromptKey && dbState?.currentPromptLabel && dbState?.currentPromptStartedAt)
        ? {
            key: dbState.currentPromptKey,
            label: dbState.currentPromptLabel,
            startedAt: Math.floor(dbState.currentPromptStartedAt.getTime() / 1000),
            source: "inject" as const,
          }
        : null;
    // Agents without lifecycle callbacks can leave inject sentinels that outlive
    // the work on local runtime. Cloud runner already applies stale cleanup.
    const currentPrompt: CurrentPrompt | null = runtimeAvailable
      ? (sessionLifecycleSignals || rawCurrentPrompt?.source === "runner" ? rawCurrentPrompt : null)
      : rawCurrentPrompt;

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

    for (const event of seam?.collectLifecycleEvents?.({
      readyAt: tmpReady,
      lockAt: tmpLock,
      closingAt: tmpClosing,
      closedAt: tmpClosed,
      currentPromptStartedAt: currentPrompt?.startedAt ?? null,
    }) ?? []) {
      if (!shouldPersistLifecycleEvent(event, lifecycleEvents)) continue;
      createOrchestrationEventOnce({
        userId,
        projectKey: tab,
        eventType: event.type,
        source: event.source,
        detail: event.detail,
        happenedAt: new Date(event.at * 1000),
      }, `runtime:${userId}:${tab.toLowerCase()}:${event.type}:${event.source}:${event.at}`)
        .catch((err) => console.error("[control] createOrchestrationEvent failed:", err));
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
    // Stream-aligned per-tab fields so the first render carries what the SSE
    // patches will keep fresh — replaces per-card polling on mount.
    promptQueue: dbState?.promptQueue ?? [],
    promptQueueRevision: dbState?.promptQueueRevision ?? 0,
    autoContinueEnabled: dbState?.autoContinueEnabled ?? true,
    autoInjectModeOverride: resolveAutoInjectOverride(projectId, tab, dir, effectiveDbProjects),
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

  return NextResponse.json(
    {
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
      runnerLastPushedAt: !isRuntimeAvailable()
        ? (() => {
            let maxAt: Date | null = runtimeSnapshotUpdatedAt;
            for (const s of dbStatesArr) {
              if (!maxAt || s.updatedAt > maxAt) maxAt = s.updatedAt;
            }
            return maxAt?.toISOString() ?? null;
          })()
        : null,
      runnerVersion: !isRuntimeAvailable() ? runnerVersion : null,
      // Execution health (≠ push heartbeat): a runner can keep pushing snapshots
      // while its command loop is hung, so dispatches silently queue forever.
      // Surface that so a stalled runner is visible, not masquerading as "Connected".
      runnerExecutionStall: !isRuntimeAvailable()
        ? await (await import("@/db/queries/pending-commands")).getRunnerExecutionStall(userId)
        : null,
      failedCommands: failedCommands ?? [],
    } satisfies ControlData,
    {
      // Browser-side cache: private (per-user payload — never share at the
      // edge) + 5s freshness. Multi-tab users + rapid SWR refetches now
      // serve from the local HTTP cache instead of re-running this route's
      // full query chain on every navigation. Critical for keeping egress
      // bounded for safety on self-hosted Postgres.
      headers: { "Cache-Control": "private, max-age=5" },
    },
  );
}
