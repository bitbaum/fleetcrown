import {
  ACTIVE_WINDOW_S,
  CLOSED_WINDOW_S,
  CLOSING_WINDOW_S,
  READY_WINDOW_S,
  withinWindow,
} from "@/lib/constants/control";
import { timeAgo } from "@/lib/dates";
import { getIntentLabel } from "@/config/control-intents";
import { AGENT_LABELS, ALL_AGENT_IDS, type AnyAgentId } from "@/lib/agent-registry";
import type { ControlData, ProjectState } from "@/lib/control-types";

/**
 * Hard cap on how old a currentPrompt can be before we declare it stale.
 * Codex has no Stop hook (interactive TUI) so the /tmp/agent-current-prompt-<tab>
 * sentinel can linger forever after the agent finishes — without this gate the
 * UI shows "Codex working 61h" on a dead tab. 30 minutes is the longest a single
 * agent task should plausibly run; longer real work writes intermediate session
 * files so the mtime-based signal below fires first.
 */
export type RuntimeSyncContext = {
  /** True when the cloud has never received a daemon runtime-state push. */
  stateUnknown?: boolean;
  /** True when the last daemon push is older than the offline threshold. */
  syncStale?: boolean;
  /** ISO timestamp of the last successful runtime-state push from the local daemon. */
  lastSyncedAt?: string | null;
};

function staleSyncLabel(lastSyncedAt: string | null | undefined): string {
  if (!lastSyncedAt) return "Last sync unknown";
  return `Last sync ${timeAgo(new Date(lastSyncedAt).getTime())}`;
}

function staleEvidenceLabel(
  display: ProjectDisplayState,
  project: ProjectState,
  lastSyncedAt: string | null | undefined,
): string {
  // 2026-05-31: dropped the "Last sync X ago" prefix from per-row strings
  // when daemon is offline globally. Showing the same fact 21 times (once
  // per project row) was the loudest information-duplication in the page —
  // the global offline banner already owns the "system is stale" signal,
  // rows should just describe the last-known state. Preserve the prefix
  // ONLY when we have NO other evidence to show (rare).
  if (display.isRunning && project.currentPrompt?.label) {
    return project.currentPrompt.label;
  }
  if (display.isReady) return "Ready for next step";
  if (display.isSessionOpen) return "Agent shell open";
  if (display.tabOpen) return "Workspace tab open";
  // Session mtime is rendered as evidenceAt; falling through to
  // staleSyncLabel would put two unlabeled timestamps side by side.
  if (project.session?.mtime) return "Idle";
  return staleSyncLabel(lastSyncedAt);
}

/** Hard cap (seconds) before currentPrompt is treated as stale — see isCurrentPromptStale. */
const STALE_PROMPT_S = 30 * 60;

/**
 * True when the recorded currentPrompt is no longer trustworthy. Layered
 * signals (positive → time-based fallback):
 *  1. Agent self-reported `session.status === "ready"` (Claude path).
 *  2. Session file rewritten after the prompt started — the agent wrote a
 *     handoff so the work cycle closed even if the Stop hook never cleared
 *     the sentinel (Codex path).
 *  3. Hard time cap. Catches agents that never write a session file at all.
 */
export function isCurrentPromptStale(project: ProjectState, nowS: number): boolean {
  if (!project.currentPrompt) return false;
  const startedAt = project.currentPrompt.startedAt;
  if (!startedAt) return false;

  const sessionStatus = project.session?.status?.trim().toLowerCase();
  if (sessionStatus === "ready") return true;
  // Agents mid-task update the handoff file with status: working — that must
  // not clear the live "Working" badge (was causing false "Open, idle").
  if (sessionStatus === "working") {
    return nowS - startedAt > STALE_PROMPT_S;
  }

  // SessionState.mtime is used for Date display elsewhere and remains milliseconds;
  // lifecycle sentinels and prompt startedAt are epoch seconds.
  const sessionMtimeS = project.session?.mtime ? Math.floor(project.session.mtime / 1000) : 0;
  if (sessionMtimeS > startedAt + 5) return true;

  if (nowS - startedAt > STALE_PROMPT_S) return true;

  return false;
}

export type ProjectDisplayState = {
  isClosed: boolean;
  isClosing: boolean;
  isReady: boolean;
  isOrchestrationReady: boolean;
  isBeaconActive: boolean;
  isRunning: boolean;
  /** SSOT for "is the agent actively working right now?" — chip + badge read this. */
  isAgentWorking: boolean;
  isSessionOpen: boolean;
  isActive: boolean;
  showRunningBanner: boolean;
  showLatestOrchestration: boolean;
  tabOpen: boolean;
  tone:
    | "offline"
    | "running"
    | "session-open"
    | "ready"
    | "orchestration-ready"
    | "closing"
    | "closed"
    | "idle";
  /** Human-readable label for the state badge — single source of truth */
  stateLabel: "Offline" | "Working" | "Ready for next step" | "Waiting for instructions" | "Closing" | "Completed" | "Not running" | "Tab open";
  /** Tailwind classes for the ui-tag badge */
  stateTagClass: string;
};

export type ControlPhase =
  | "offline"
  | "not_running"
  | "working"
  | "waiting_for_user"
  | "open_idle"
  | "closing"
  | "completed";

export type ProjectOperationsSnapshot = {
  project: ProjectState;
  phase: ControlPhase;
  display: ProjectDisplayState;
  evidenceLabel: string;
  evidenceAt: number | null;
  evidenceKind: "live" | "historical" | "unknown";
  contextSummary: string | null;
  attentionReason: string | null;
};

export type ControlDashboardState = {
  runningCount: number;
  waitingCount: number;
  controlProjectCount: number;
  openTabCount: number;
  idleCount: number;
  commitsToday: number;
};

export type AttentionItem = {
  project: ProjectState;
  score: number;
  reason: string;
};

export type LiveTabRow = {
  tabName: string;
  project: ProjectState | null;
  agentLabel: string | null;
  stateLabel: ProjectDisplayState["stateLabel"] | "Open" | "Open, idle";
  stateTagClass: string;
  activity: string;
  isWorking: boolean;
  isWaiting: boolean;
  registered: boolean;
};

type LiveTabRankLabel = LiveTabRow["stateLabel"];

const LIVE_TAB_RANK: Record<LiveTabRankLabel, number> = {
  Offline: 0,
  Working: 0,
  "Ready for next step": 1,
  "Waiting for instructions": 3,
  Closing: 2,
  Completed: 3,
  "Not running": 4,
  "Tab open": 4,
  "Open, idle": 4,
  Open: 5,
};

/** Map an open Zellij tab name back to a registered fleet project. */
export function findProjectForOpenTab(openTab: string, projects: ProjectState[]): ProjectState | null {
  const lower = openTab.toLowerCase();
  const exact = projects.find(
    (p) => p.tab.toLowerCase() === lower || p.liveTab.toLowerCase() === lower,
  );
  if (exact) return exact;

  const prefix = projects.find((p) => {
    const base = p.tab.toLowerCase();
    return lower === base || lower.startsWith(`${base} `) || lower.startsWith(`${base}-`);
  });
  return prefix ?? null;
}

export function isProjectTabOpen(project: ProjectState, zellijTabs: string[]): boolean {
  const canonical = (project.liveTab ?? project.tab).toLowerCase();
  const projectKey = project.tab.toLowerCase();
  return zellijTabs.some((tab) => {
    const open = tab.toLowerCase();
    return (
      open === canonical ||
      open === projectKey ||
      open.startsWith(`${canonical} `) ||
      open.startsWith(`${canonical}-`) ||
      open.startsWith(`${projectKey} `) ||
      open.startsWith(`${projectKey}-`)
    );
  });
}

export function getTabActivityText(
  project: ProjectState | null,
  display: ProjectDisplayState | null,
): string {
  // Returns the short status string shown next to each project row.
  // Critical rule (2026-05-31): NEVER paste raw handoff content (the agent's
  // own done/next/status notes) into the default row text. These were leaking
  // into the UI as "Saved handoff: ..." prefixes that exposed internal agent
  // bookkeeping to the user, including multi-paragraph dumps that wrecked the
  // row layout. Activity text is for human-readable lifecycle states only;
  // handoff content belongs in a per-project expand/tooltip, not the
  // always-visible row.
  if (!project) return "Tab open — not registered in fleet";
  if (display?.isRunning && project.currentPrompt?.label) {
    return project.currentPrompt.label;
  }
  if (display?.isReady || display?.isOrchestrationReady) {
    return "Ready — pick the next task";
  }
  if (project.agentRunning) return "Agent open · idle";
  if (display?.tabOpen) return "Tab open · no agent process";
  return "Closed";
}

export function buildLiveTabRows(
  zellijTabs: string[],
  projects: ProjectState[],
  nowS: number,
): LiveTabRow[] {
  const uniqueTabs = [...new Set(zellijTabs.map((t) => t.trim()).filter(Boolean))];
  return uniqueTabs
    .map((tabName) => {
      // 2026-05-31: skip zellij tabs that don't map to any registered project.
      // The user surfaced "Tab #1 Unlinked" as visible noise — scratch tabs
      // they opened manually that have nothing to do with the fleet. Their
      // real zellij window already shows them; the FleetCrown UI is for fleet
      // ops, not a generic tab list. To re-expose unregistered tabs later,
      // gate this on a "show all tabs" toggle in the UI.
      const project = findProjectForOpenTab(tabName, projects);
      if (!project) return null;
      return tabName;
    })
    .filter((t): t is string => t !== null)
    .map((tabName) => {
      const project = findProjectForOpenTab(tabName, projects);
      const display = project ? getProjectDisplayState(project, uniqueTabs, nowS) : null;
      const agentLabel = project?.activeAgents.length
        ? formatAgentRuntimeLabel(project, tabName)
        : display?.isRunning
          ? "Agent"
          : inferAgentLabelFromTabName(tabName);
      const stateLabel: LiveTabRow["stateLabel"] = display?.tone === "idle" && display.tabOpen
        ? "Open, idle"
        : display?.stateLabel ?? "Open";
      const stateTagClass = display?.stateTagClass ?? "ui-tag ui-tag-neutral";
      return {
        tabName,
        project,
        agentLabel: agentLabel || null,
        stateLabel,
        stateTagClass,
        activity: getTabActivityText(project, display),
        isWorking: display?.isRunning ?? false,
        isWaiting: display?.isReady || display?.isOrchestrationReady || display?.tone === "session-open" || false,
        registered: project != null,
      } satisfies LiveTabRow;
    })
    .sort((a, b) => {
      const rankDelta = LIVE_TAB_RANK[a.stateLabel] - LIVE_TAB_RANK[b.stateLabel];
      if (rankDelta !== 0) return rankDelta;
      return a.tabName.localeCompare(b.tabName);
    });
}

export type ControlPageState = {
  dashboard: ControlDashboardState;
  attention: AttentionItem[];
};

function attentionScore(project: ProjectState): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  const sessionHealth = project.session?.health?.toLowerCase() ?? "";
  if (sessionHealth === "critical") { score += 4; reasons.push("critical"); }
  else if (sessionHealth.includes("attention")) { score += 2; reasons.push("needs attention"); }

  const runHealth = project.latestOrchestrationRun?.summary?.health?.toLowerCase() ?? "";
  if (runHealth === "critical" && score < 4) { score += 3; reasons.push("last run: critical"); }
  else if (runHealth.includes("attention") && score < 2) { score += 2; reasons.push("last run: needs attention"); }

  return { score, reason: reasons[0] ?? "" };
}

/** "agent" is a legacy process basename for Cursor — see scripts/_agents.sh
 *  AGENT_PROCESS_NAMES[cursor]="agent". Only relevant when reading active
 *  process names, never as a UI id. */
const PROCESS_NAME_ALIASES: Record<string, AnyAgentId> = {
  agent: "cursor",
};

function labelForProcessOrAdapter(name: string): string {
  const id = (PROCESS_NAME_ALIASES[name] ?? name) as AnyAgentId;
  return AGENT_LABELS[id] ?? (name[0]?.toUpperCase() + name.slice(1));
}

export function formatAgentRuntimeLabel(project: ProjectState, liveTab?: string): string {
  // Prefer live process detection
  let names = project.activeAgents.length ? project.activeAgents : [];
  // Then current prompt adapter (what was last dispatched)
  if (!names.length && project.currentPrompt?.adapter) {
    names = [project.currentPrompt.adapter];
  }
  // Strong fallback: infer from the actual live tab name the project is using right now.
  // This fixes the case where the user is actively in the tab running Grok (or another agent)
  // but activeAgents / currentPrompt haven't updated yet or the process scan missed it.
  if (!names.length && liveTab) {
    const inferred = inferAdapterFromTabName(liveTab);
    if (inferred) names = [inferred];
  }
  return names.map(labelForProcessOrAdapter).join(", ");
}

export function inferAgentLabelFromTabName(tabName: string): string | null {
  const id = inferAdapterFromTabName(tabName);
  return id ? (AGENT_LABELS[id] ?? null) : null;
}

/** Tab suffix → adapter id: "FleetCrown Cursor" → "cursor". Mirrors scripts/_agents.sh.
 *  IDs come from ALL_AGENT_IDS in agent-registry — the single source of truth. */
export function inferAdapterFromTabName(tabName: string): AnyAgentId | null {
  const normalized = tabName.toLowerCase();
  for (const id of ALL_AGENT_IDS) {
    if (normalized === id || normalized.endsWith(` ${id}`) || normalized.endsWith(`-${id}`)) {
      return id;
    }
  }
  return null;
}

export function getProjectDisplayState(
  project: ProjectState,
  zellijTabs: string[],
  nowS: number,
  dismissed = false,
  runtimeStateKnown = true,
): ProjectDisplayState {
  if (!runtimeStateKnown) {
    return {
      isClosed: false,
      isClosing: false,
      isReady: false,
      isOrchestrationReady: false,
      isBeaconActive: false,
      isRunning: false,
      isAgentWorking: false,
      isSessionOpen: false,
      isActive: false,
      showRunningBanner: false,
      showLatestOrchestration: false,
      tabOpen: false,
      tone: "offline",
      stateLabel: "Offline",
      stateTagClass: "ui-tag ui-tag-warning",
    };
  }
  // Track active work from a fresh current-prompt sentinel. Do not require
  // agentRunning — cloud daemon may hold a FleetCrown-dispatched prompt while
  // /proc scan misses Cursor Agent or IDE-side Composer activity.
  const stale = isCurrentPromptStale(project, nowS);
  const currentPrompt = project.currentPrompt && !stale ? project.currentPrompt : null;
  const promptRunning = Boolean(currentPrompt);
  const isSessionOpen = project.agentRunning;

  const isClosed =
    !dismissed &&
    !project.agentRunning &&
    withinWindow(project.closedAt, nowS, CLOSED_WINDOW_S);
  const isClosing =
    !dismissed &&
    !isClosed &&
    withinWindow(project.closingAt, nowS, CLOSING_WINDOW_S);
  // Ready when the stop hook has fired recently AND no prompt is actively running.
  // We do NOT require !agentRunning because the claude process stays alive between
  // turns — using it would permanently suppress the ready state for all active sessions.
  const isReady =
    !dismissed &&
    !isClosed &&
    !isClosing &&
    !currentPrompt &&
    withinWindow(project.readyAt, nowS, READY_WINDOW_S);

  const isBeaconActive = withinWindow(project.lockAt, nowS, READY_WINDOW_S);

  const latestFinishedAtS = project.latestOrchestrationRun?.finishedAt
    ? Math.floor(new Date(project.latestOrchestrationRun.finishedAt).getTime() / 1000)
    : null;
  const isOrchestrationReady =
    !dismissed &&
    !isReady &&
    !isClosed &&
    !isClosing &&
    !currentPrompt &&
    project.latestOrchestrationRun?.state === "done" &&
    withinWindow(latestFinishedAtS, nowS, READY_WINDOW_S);

  const isRunning = promptRunning;
  // Show the running banner whenever a prompt is actively tracked — don't require
  // isRunning because the process may not yet appear in /proc on the current tick.
  const showRunningBanner = !isClosing && !isReady && Boolean(currentPrompt);
  const showLatestOrchestration =
    Boolean(project.latestOrchestrationRun) &&
    project.latestOrchestrationRun?.state !== "error" &&
    !isRunning &&
    !showRunningBanner &&
    !isReady &&
    !isOrchestrationReady &&
    !isClosing &&
    !isClosed;
  const tabOpen = isProjectTabOpen(project, zellijTabs);
  const isActive =
    isRunning ||
    isOrchestrationReady ||
    withinWindow(project.readyAt, nowS, ACTIVE_WINDOW_S) ||
    withinWindow(project.closingAt, nowS, ACTIVE_WINDOW_S) ||
    withinWindow(project.closedAt, nowS, ACTIVE_WINDOW_S) ||
    isSessionOpen ||
    currentPrompt !== null;

  const tone: ProjectDisplayState["tone"] = isClosed
    ? "closed"
    : isClosing
    ? "closing"
    : isReady
    ? "ready"
    : isOrchestrationReady
    ? "orchestration-ready"
    : isRunning
    ? "running"
    : isSessionOpen
    ? "session-open"
    : "idle";

  const STATE_LABEL: Record<ProjectDisplayState["tone"], ProjectDisplayState["stateLabel"]> = {
    offline:               "Offline",
    running:               "Working",
    "session-open":        "Waiting for instructions",
    ready:                 "Ready for next step",
    "orchestration-ready": "Ready for next step",
    closing:               "Closing",
    closed:                "Completed",
    idle:                  "Not running",
  };
  const STATE_TAG: Record<ProjectDisplayState["tone"], string> = {
    offline:               "ui-tag ui-tag-warning",
    running:               "ui-tag ui-tag-accent",
    "session-open":        "ui-tag ui-tag-neutral",
    ready:                 "ui-tag ui-tag-positive",
    "orchestration-ready": "ui-tag ui-tag-positive",
    closing:               "ui-tag ui-tag-warning",
    closed:                "ui-tag ui-tag-positive",
    idle:                  "ui-tag ui-tag-neutral",
  };

  // When the Zellij tab is open but no agent/prompt is tracked, "Not running"
  // reads like nothing exists — "Tab open" matches what the user can verify.
  const stateLabel = tone === "idle" && tabOpen && !isSessionOpen
    ? "Tab open"
    : STATE_LABEL[tone];

  return {
    isClosed,
    isClosing,
    isReady,
    isOrchestrationReady,
    isBeaconActive,
    isRunning,
    isAgentWorking: isRunning,
    isSessionOpen,
    isActive,
    showRunningBanner,
    showLatestOrchestration,
    tabOpen,
    tone,
    stateLabel,
    stateTagClass: STATE_TAG[tone],
  };
}

export function buildProjectOperationsSnapshot(
  project: ProjectState,
  zellijTabs: string[],
  nowS: number,
  runtimeStateKnown = true,
  syncCtx: RuntimeSyncContext = {},
): ProjectOperationsSnapshot {
  const { syncStale = false, lastSyncedAt = null } = syncCtx;
  const display = getProjectDisplayState(project, zellijTabs, nowS, false, runtimeStateKnown);
  const phase: ControlPhase = display.tone === "offline"
    ? "offline"
    : display.isRunning
      ? "working"
      : display.isClosing
        ? "closing"
        : display.isClosed
          ? "completed"
          : display.isReady || display.isOrchestrationReady
            ? "waiting_for_user"
            : display.isSessionOpen
              ? "open_idle"
            : "not_running";
  const attention = attentionScore(project);
  const handoffAt = project.session?.mtime ?? null;
  const contextSummary = display.isRunning && project.currentPrompt?.label
    ? project.currentPrompt.label
    : project.session?.next?.trim()
      ? project.session.next.trim()
      : project.session?.done?.trim()
        ? project.session.done.trim()
        : null;
  const liveObserved = runtimeStateKnown && !syncStale && (display.isRunning || display.isReady || display.isOrchestrationReady || display.isSessionOpen || display.tabOpen);
  const latestInjection = project.recentInjections[0];
  const latestInjectionAgeS = latestInjection?.dispatchedAt
    ? nowS - Math.floor(new Date(latestInjection.dispatchedAt).getTime() / 1000)
    : null;
  const latestInjectionLabel = latestInjection
    ? (latestInjection.customPrompt?.trim() || getIntentLabel(latestInjection.intent))
    : null;
  const recentDispatchSuffix =
    latestInjection &&
    latestInjectionAgeS !== null &&
    latestInjectionAgeS >= 0 &&
    latestInjectionAgeS < 30 * 60
      ? `Last dispatch ${timeAgo(new Date(latestInjection.dispatchedAt).getTime())}${latestInjectionLabel ? ` · ${latestInjectionLabel}` : ""}`
      : null;

  const liveEvidenceLabel = display.isRunning
    ? "Live agent process detected"
    : display.isReady
      ? "Agent signaled ready on connected computer"
      : display.isOrchestrationReady
        ? "Last run completed"
        : display.isSessionOpen
          ? "Agent shell waiting for instructions"
          : display.tabOpen
            ? recentDispatchSuffix
              ? `Workspace tab open · ${recentDispatchSuffix}`
              : "Workspace tab open"
            : "No live observation";

  // "Saved agent context" was the prior wording — flagged in browser dogfood
  // 2026-05-31 as opaque jargon that reads like an internal-data label (the
  // user wondered whether their notes were being exposed). Replaced with
  // "Idle" which describes the OBSERVABLE state for the human, not the
  // internal-data state for the system. The recency is shown separately by
  // the row's timestamp column, so the prefix doesn't need to duplicate it.
  const evidenceLabel = !runtimeStateKnown
    ? "Live status unavailable"
    : syncStale
      ? staleEvidenceLabel(display, project, lastSyncedAt)
      : liveObserved
        ? liveEvidenceLabel
        : handoffAt
          ? "Idle"
          : "No live observation";

  return {
    project,
    phase,
    display,
    evidenceLabel,
    evidenceAt: liveObserved ? null : handoffAt,
    evidenceKind: !runtimeStateKnown ? "unknown" : syncStale ? "historical" : liveObserved ? "live" : "historical",
    contextSummary,
    attentionReason: attention.score > 0 ? attention.reason : null,
  };
}

export function buildProjectOperationsSnapshots(
  projects: ProjectState[],
  zellijTabs: string[],
  nowS: number,
  runtimeStateKnown = true,
  syncCtx: RuntimeSyncContext = {},
): ProjectOperationsSnapshot[] {
  return projects
    .map((project) => buildProjectOperationsSnapshot(project, zellijTabs, nowS, runtimeStateKnown, syncCtx))
    .sort((a, b) => compareProjects(a.project, b.project, zellijTabs, nowS, runtimeStateKnown));
}

function compareProjects(
  a: ProjectState,
  b: ProjectState,
  zellijTabs: string[],
  nowS: number,
  runtimeStateKnown: boolean,
): number {
  const aState = getProjectDisplayState(a, zellijTabs, nowS, false, runtimeStateKnown);
  const bState = getProjectDisplayState(b, zellijTabs, nowS, false, runtimeStateKnown);

  const rank = (state: ProjectDisplayState): number => {
    if (state.isReady || state.isOrchestrationReady) return 0;
    if (state.isRunning) return 1;
    if (state.isClosing) return 2;
    if (state.isSessionOpen) return 3;
    if (state.isClosed) return 4;
    return 5;
  };

  const rankDelta = rank(aState) - rank(bState);
  if (rankDelta !== 0) return rankDelta;

  const aActiveGit = (a.git?.todayCount ?? 0) > 0 ? 0 : 1;
  const bActiveGit = (b.git?.todayCount ?? 0) > 0 ? 0 : 1;
  return aActiveGit - bActiveGit;
}

export function buildControlPageState(
  data: ControlData,
  nowS: number,
  runtimeStateKnown = true,
): ControlPageState {
  const runningCount = data.projects.filter((project) => {
    const state = getProjectDisplayState(project, data.zellijTabs, nowS, false, runtimeStateKnown);
    return state.isRunning;
  }).length;
  const waitingCount = data.projects.filter((project) => {
    const state = getProjectDisplayState(project, data.zellijTabs, nowS, false, runtimeStateKnown);
    return state.isReady || state.isOrchestrationReady || (state.isSessionOpen && !state.isRunning);
  }).length;
  const openTabCount = data.projects.filter((project) => isProjectTabOpen(project, data.zellijTabs)).length;
  const controlProjectCount = data.inventory.controlProjectCount ?? 0;
  const idleCount = data.projects.filter((project) => {
    const state = getProjectDisplayState(project, data.zellijTabs, nowS, false, runtimeStateKnown);
    return !state.isActive;
  }).length;
  const commitsToday = data.projects.reduce((sum, p) => sum + (p.git?.todayCount ?? 0), 0);

  const attention = data.projects
    .map((project) => ({ project, ...attentionScore(project) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return {
    attention,
    dashboard: {
      runningCount,
      waitingCount,
      controlProjectCount,
      openTabCount,
      idleCount,

      commitsToday,
    },
  };
}
