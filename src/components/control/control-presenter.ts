import {
  ACTIVE_WINDOW_S,
  CLOSED_WINDOW_S,
  CLOSING_WINDOW_S,
  READY_WINDOW_S,
  withinWindow,
} from "@/lib/constants/control";
import type { ControlData, ProjectState } from "@/lib/control-types";

/**
 * Hard cap on how old a currentPrompt can be before we declare it stale.
 * Codex has no Stop hook (interactive TUI) so the /tmp/agent-current-prompt-<tab>
 * sentinel can linger forever after the agent finishes — without this gate the
 * UI shows "Codex working 61h" on a dead tab. 30 minutes is the longest a single
 * agent task should plausibly run; longer real work writes intermediate session
 * files so the mtime-based signal below fires first.
 */
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

  if (project.session?.status === "ready") return true;

  const sessionMtime = project.session?.mtime ?? 0;
  if (sessionMtime > startedAt + 5) return true;

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
    | "running"
    | "session-open"
    | "ready"
    | "orchestration-ready"
    | "closing"
    | "closed"
    | "idle";
  /** Human-readable label for the state badge — single source of truth */
  stateLabel: "Working" | "Ready" | "Waiting" | "Closing" | "Closed" | "Idle";
  /** Tailwind classes for the ui-tag badge */
  stateTagClass: string;
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

export type ControlPageState = {
  activeProjects: ProjectState[];
  idleProjects: ProjectState[];
  /** Subset of idleProjects with uncommitted local changes — surfaces to a
   *  separate "Needs attention" subgroup so the long quiet list doesn't bury them. */
  idleNeedsAttention: ProjectState[];
  /** Idle projects with a clean working tree, touched within IDLE_STALE_S. */
  idleQuiet: ProjectState[];
  /** Idle projects with no session OR session.mtime older than IDLE_STALE_S — the dormant tail. */
  idleStale: ProjectState[];
  sortedProjects: ProjectState[];
  dashboard: ControlDashboardState;
  attention: AttentionItem[];
};

/** Idle projects with session.mtime older than this (seconds) drop into the
 *  "Stale" bucket — 30 days matches the threshold at which a project usually
 *  needs a fresh `gog` / re-orient pass before any agent dispatch makes sense. */
const IDLE_STALE_S = 30 * 86_400;

/** True when an idle project has uncommitted local work — the simplest signal
 *  that the project is mid-something and shouldn't blend into the quiet pile. */
function idleNeedsAttention(project: ProjectState): boolean {
  return !!project.git && (project.git.dirty || project.git.dirtyCount > 0);
}

/** True when an idle project hasn't been touched in IDLE_STALE_S — by mtime,
 *  with no-session falling through to stale (a never-touched project IS dormant). */
function idleIsStale(project: ProjectState, nowS: number): boolean {
  if (!project.session) return true;
  return nowS - project.session.mtime > IDLE_STALE_S;
}

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

export function formatAgentRuntimeLabel(project: ProjectState): string {
  return project.activeAgents
    .map((name) => name[0]?.toUpperCase() + name.slice(1))
    .join(", ");
}

export function getProjectDisplayState(
  project: ProjectState,
  zellijTabs: string[],
  nowS: number,
  dismissed = false,
): ProjectDisplayState {
  // "agentRunning" means an agent process/session exists. It does not prove
  // active work: Claude/Codex can sit open at an input prompt after a task.
  // The staleness gate covers the Codex-no-Stop-hook case where the
  // /tmp/agent-current-prompt-<tab> sentinel lingers past the work cycle.
  const stale = isCurrentPromptStale(project, nowS);
  const currentPrompt = project.agentRunning && !stale ? project.currentPrompt : null;
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
  const tabOpen = zellijTabs.some(
    (tab) => tab.toLowerCase() === (project.liveTab ?? project.tab).toLowerCase(),
  );
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
    running:               "Working",
    "session-open":        "Ready",
    ready:                 "Waiting",
    "orchestration-ready": "Waiting",
    closing:               "Closing",
    closed:                "Closed",
    idle:                  "Idle",
  };
  const STATE_TAG: Record<ProjectDisplayState["tone"], string> = {
    running:               "ui-tag ui-tag-warning",
    "session-open":        "ui-tag ui-tag-neutral",
    ready:                 "ui-tag ui-tag-positive",
    "orchestration-ready": "ui-tag ui-tag-positive",
    closing:               "ui-tag ui-tag-warning",
    closed:                "ui-tag ui-tag-positive",
    idle:                  "ui-tag ui-tag-neutral",
  };

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
    stateLabel: STATE_LABEL[tone],
    stateTagClass: STATE_TAG[tone],
  };
}

function compareProjects(
  a: ProjectState,
  b: ProjectState,
  zellijTabs: string[],
  nowS: number,
): number {
  const aState = getProjectDisplayState(a, zellijTabs, nowS);
  const bState = getProjectDisplayState(b, zellijTabs, nowS);

  const rank = (state: ProjectDisplayState): number => {
    if (state.isClosed) return 0;
    if (state.isClosing) return 1;
    if (state.isReady || state.isOrchestrationReady) return 2;
    if (state.isRunning) return 3;
    return 4;
  };

  const rankDelta = rank(aState) - rank(bState);
  if (rankDelta !== 0) return rankDelta;

  const aActiveGit = (a.git?.todayCount ?? 0) > 0 ? 0 : 1;
  const bActiveGit = (b.git?.todayCount ?? 0) > 0 ? 0 : 1;
  return aActiveGit - bActiveGit;
}

export function buildControlPageState(
  data: ControlData,
  expandedTabs: Set<string>,
  nowS: number,
): ControlPageState {
  // Capture DB-order indices so user-defined position is the final tiebreaker.
  // data.projects arrives ordered by user_projects.position from the API.
  const withIndex = data.projects.map((p, i) => ({ p, i }));
  const sortedProjects = withIndex
    .sort((a, b) => compareProjects(a.p, b.p, data.zellijTabs, nowS) || (a.i - b.i))
    .map(({ p }) => p);

  const activeProjects = sortedProjects.filter((project) => {
    const state = getProjectDisplayState(project, data.zellijTabs, nowS);
    return state.isActive || expandedTabs.has(project.tab);
  });
  const idleProjects = sortedProjects.filter((project) => {
    const state = getProjectDisplayState(project, data.zellijTabs, nowS);
    return !state.isActive && !expandedTabs.has(project.tab);
  });
  const idleNeedsAttn = idleProjects.filter(idleNeedsAttention);
  const idleRest = idleProjects.filter((p) => !idleNeedsAttention(p));
  const idleQuietList = idleRest.filter((p) => !idleIsStale(p, nowS));
  // Sort Stale oldest-first so the most-prunable candidates surface at the
  // top. No-session is treated as -∞ (never touched → most prunable). Stable
  // sort: same-mtime ties preserve the upstream rank.
  const idleStaleList = idleRest
    .filter((p) => idleIsStale(p, nowS))
    .sort((a, b) => (a.session?.mtime ?? -Infinity) - (b.session?.mtime ?? -Infinity));

  const runningCount = data.projects.filter((project) => {
    const state = getProjectDisplayState(project, data.zellijTabs, nowS);
    return state.isRunning;
  }).length;
  const waitingCount = data.projects.filter((project) => {
    const state = getProjectDisplayState(project, data.zellijTabs, nowS);
    return state.isReady || state.isOrchestrationReady;
  }).length;
  const openTabCount = data.projects.filter((project) =>
    data.zellijTabs.some(
      (tab) => tab.toLowerCase() === (project.liveTab ?? project.tab).toLowerCase(),
    ),
  ).length;
  const controlProjectCount = data.inventory.controlProjectCount ?? 0;
  const idleCount = idleProjects.length;
  const commitsToday = data.projects.reduce((sum, p) => sum + (p.git?.todayCount ?? 0), 0);

  const attention = data.projects
    .map((project) => ({ project, ...attentionScore(project) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return {
    activeProjects,
    idleProjects,
    idleNeedsAttention: idleNeedsAttn,
    idleQuiet: idleQuietList,
    idleStale: idleStaleList,
    sortedProjects,
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
