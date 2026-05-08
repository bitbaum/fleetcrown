import {
  CLOSED_WINDOW_S,
  CLOSING_WINDOW_S,
  READY_WINDOW_S,
  withinWindow,
} from "@/lib/constants/control";
import type { ControlData, ProjectState } from "@/lib/control-types";

const ACTIVE_WINDOW_S = 300;

export type ProjectDisplayState = {
  isClosed: boolean;
  isClosing: boolean;
  isReady: boolean;
  isOrchestrationReady: boolean;
  isRunning: boolean;
  isActive: boolean;
  showRunningBanner: boolean;
  showLatestOrchestration: boolean;
  tabOpen: boolean;
  tone:
    | "running"
    | "ready"
    | "orchestration-ready"
    | "closing"
    | "closed"
    | "idle";
};

export type ControlDashboardState = {
  runningCount: number;
  waitingCount: number;
  controlProjectCount: number;
  openTabCount: number;
  idleCount: number;
  expandedCount: number;
  inventoryNote: string | null;
};

export type ControlPageState = {
  activeProjects: ProjectState[];
  idleProjects: ProjectState[];
  sortedProjects: ProjectState[];
  dashboard: ControlDashboardState;
};

export function getProjectDisplayState(
  project: ProjectState,
  zellijTabs: string[],
  nowS: number,
  dismissed = false,
): ProjectDisplayState {
  // If the agent process is gone but the currentPrompt file wasn't cleaned up (process
  // crashed before the stop hook ran), treat the file as absent so the UI doesn't get
  // stuck on "Running: <stale task>" indefinitely.
  const currentPrompt = project.agentRunning ? project.currentPrompt : null;

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

  const isRunning = project.agentRunning;
  // Show the running banner whenever a prompt is actively tracked — don't require
  // isRunning because the process may not yet appear in /proc on the current tick.
  const showRunningBanner = !isClosing && !isReady && Boolean(currentPrompt);
  const showLatestOrchestration =
    Boolean(project.latestOrchestrationRun) &&
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
    withinWindow(project.readyAt, nowS, ACTIVE_WINDOW_S) ||
    withinWindow(project.closingAt, nowS, ACTIVE_WINDOW_S) ||
    withinWindow(project.closedAt, nowS, ACTIVE_WINDOW_S) ||
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
    : "idle";

  return {
    isClosed,
    isClosing,
    isReady,
    isOrchestrationReady,
    isRunning,
    isActive,
    showRunningBanner,
    showLatestOrchestration,
    tabOpen,
    tone,
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
  if (aActiveGit !== bActiveGit) return aActiveGit - bActiveGit;

  return a.tab.localeCompare(b.tab);
}

export function buildControlPageState(
  data: ControlData,
  expandedTabs: Set<string>,
  nowS: number,
): ControlPageState {
  const sortedProjects = [...data.projects].sort((a, b) =>
    compareProjects(a, b, data.zellijTabs, nowS),
  );

  const activeProjects = sortedProjects.filter((project) => {
    const state = getProjectDisplayState(project, data.zellijTabs, nowS);
    return state.isActive || expandedTabs.has(project.tab);
  });
  const idleProjects = sortedProjects.filter((project) => {
    const state = getProjectDisplayState(project, data.zellijTabs, nowS);
    return !state.isActive && !expandedTabs.has(project.tab);
  });

  const runningCount = data.projects.filter((project) => project.agentRunning).length;
  const waitingCount = data.projects.filter((project) => {
    const state = getProjectDisplayState(project, data.zellijTabs, nowS);
    return state.isReady;
  }).length;
  const openTabCount = data.projects.filter((project) =>
    data.zellijTabs.some(
      (tab) => tab.toLowerCase() === (project.liveTab ?? project.tab).toLowerCase(),
    ),
  ).length;
  const controlProjectCount = data.inventory.controlProjectCount ?? 0;
  const idleCount = idleProjects.length;
  const expandedCount = expandedTabs.size;
  const inventoryNote =
    data.inventory.source === "user_projects"
      ? `Source: Projects database · ${controlProjectCount} directory-backed projects available in Control`
      : `Source: agent-projects.conf fallback · ${controlProjectCount} projects available in Control`;

  return {
    activeProjects,
    idleProjects,
    sortedProjects,
    dashboard: {
      runningCount,
      waitingCount,
      controlProjectCount,
      openTabCount,
      idleCount,
      expandedCount,
      inventoryNote,
    },
  };
}
