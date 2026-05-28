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
  stateLabel: "Offline" | "Working" | "Waiting for you" | "Closing" | "Completed" | "Not running";
  /** Tailwind classes for the ui-tag badge */
  stateTagClass: string;
};

export type ControlPhase =
  | "offline"
  | "not_running"
  | "working"
  | "waiting_for_user"
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
  "Waiting for you": 1,
  Closing: 2,
  Completed: 3,
  "Not running": 4,
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

export function getTabActivityText(
  project: ProjectState | null,
  display: ProjectDisplayState | null,
): string {
  if (!project) return "Tab open — not registered in fleet";
  if (display?.isRunning && project.currentPrompt?.label) {
    return project.currentPrompt.label;
  }
  if ((display?.isReady || display?.isOrchestrationReady) && project.session?.next?.trim()) {
    return project.session.next.trim();
  }
  if (display?.isReady || display?.isOrchestrationReady) {
    return "Waiting for your next instruction";
  }
  if (project.session?.next?.trim()) return `Saved handoff: ${project.session.next.trim()}`;
  if (project.session?.done?.trim()) {
    return `Saved handoff: ${project.session.done.trim().slice(0, 140)}`;
  }
  if (project.agentRunning) return "Agent CLI process is open";
  if (display?.tabOpen) return "Tab is open; no agent CLI process detected";
  return "No live agent process detected";
}

export function buildLiveTabRows(
  zellijTabs: string[],
  projects: ProjectState[],
  nowS: number,
): LiveTabRow[] {
  const uniqueTabs = [...new Set(zellijTabs.map((t) => t.trim()).filter(Boolean))];
  return uniqueTabs
    .map((tabName) => {
      const project = findProjectForOpenTab(tabName, projects);
      const display = project ? getProjectDisplayState(project, uniqueTabs, nowS) : null;
      const agentLabel = project?.activeAgents.length
        ? formatAgentRuntimeLabel(project)
        : project?.agentPref
          ? project.agentPref[0]?.toUpperCase() + project.agentPref.slice(1)
          : null;
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
        isWaiting: display?.isReady || display?.isOrchestrationReady || false,
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

export function formatAgentRuntimeLabel(project: ProjectState): string {
  const labels: Record<string, string> = {
    cursor: "Cursor",
    agent: "Cursor",
  };
  return project.activeAgents
    .map((name) => labels[name] ?? (name[0]?.toUpperCase() + name.slice(1)))
    .join(", ");
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
    offline:               "Offline",
    running:               "Working",
    "session-open":        "Waiting for you",
    ready:                 "Waiting for you",
    "orchestration-ready": "Waiting for you",
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

export function buildProjectOperationsSnapshot(
  project: ProjectState,
  zellijTabs: string[],
  nowS: number,
  runtimeStateKnown = true,
): ProjectOperationsSnapshot {
  const display = getProjectDisplayState(project, zellijTabs, nowS, false, runtimeStateKnown);
  const phase: ControlPhase = display.tone === "offline"
    ? "offline"
    : display.isRunning
      ? "working"
      : display.isClosing
        ? "closing"
        : display.isClosed
          ? "completed"
          : display.isReady || display.isOrchestrationReady || display.isSessionOpen
            ? "waiting_for_user"
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
  const liveObserved = runtimeStateKnown && (display.isRunning || display.isSessionOpen || display.tabOpen);

  return {
    project,
    phase,
    display,
    evidenceLabel: !runtimeStateKnown
      ? "Live status unavailable"
      : liveObserved
        ? "Observed on connected computer"
        : handoffAt
          ? "Saved agent context"
          : "No live observation",
    evidenceAt: liveObserved ? null : handoffAt,
    evidenceKind: !runtimeStateKnown ? "unknown" : liveObserved ? "live" : "historical",
    contextSummary,
    attentionReason: attention.score > 0 ? attention.reason : null,
  };
}

export function buildProjectOperationsSnapshots(
  projects: ProjectState[],
  zellijTabs: string[],
  nowS: number,
  runtimeStateKnown = true,
): ProjectOperationsSnapshot[] {
  return projects
    .map((project) => buildProjectOperationsSnapshot(project, zellijTabs, nowS, runtimeStateKnown))
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
    return state.isReady || state.isOrchestrationReady;
  }).length;
  const openTabCount = data.projects.filter((project) =>
    data.zellijTabs.some(
      (tab) => tab.toLowerCase() === (project.liveTab ?? project.tab).toLowerCase(),
    ),
  ).length;
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
