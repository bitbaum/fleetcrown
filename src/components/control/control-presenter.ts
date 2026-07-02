import {
  ACTIVE_WINDOW_S,
  AGENT_ABSENT_GRACE_S,
  CLOSED_WINDOW_S,
  CLOSING_WINDOW_S,
  READY_WINDOW_S,
  withinWindow,
} from "@/lib/constants/control";
import { timeAgo } from "@/lib/dates";
import { AGENT_LABELS, type AnyAgentId } from "@/lib/agent-labels";
import { inferAdapterFromTabName } from "@/lib/agent-resolution";
import {
  STATE_DEFINITIONS,
  type ProjectStateKey,
} from "@/lib/control-states";

export { inferAdapterFromTabName } from "@/lib/agent-resolution";
import type { ControlData, ProjectState } from "@/lib/control-types";
import type { OrchestrationOutcome } from "@/db/schema/orchestration-runs";
import { latestActivitySummary } from "./project-activity-ledger";

export type RuntimeSyncContext = {
  /** True when the cloud has never received a runner runtime-state push. */
  stateUnknown?: boolean;
  /** True when the last runner push is older than the offline threshold. */
  syncStale?: boolean;
  /** ISO timestamp of the last successful runtime-state push from the local runner. */
  lastSyncedAt?: string | null;
};

function staleSyncLabel(lastSyncedAt: string | null | undefined): string {
  if (!lastSyncedAt) return "Last sync unknown";
  return `Last sync ${timeAgo(new Date(lastSyncedAt).getTime())}`;
}

/**
 * Hard cap (seconds) on how old a currentPrompt can be before we declare it
 * stale — see isCurrentPromptStale. Codex has no Stop hook (interactive TUI)
 * so the /tmp/agent-current-prompt-<tab> sentinel can linger forever after
 * the agent finishes — without this gate the UI shows "Codex working 61h" on
 * a dead tab. 30 minutes is the longest a single agent task should plausibly
 * run; longer real work writes intermediate session files so the mtime-based
 * signal fires first.
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

  const sessionStatus = project.session?.status?.trim().toLowerCase();
  if (sessionStatus === "ready") return true;
  // Agents mid-task update the handoff file with status: working — that must
  // not clear the live "Working" badge (was causing false "Open, idle").
  if (sessionStatus === "working") {
    return nowS - startedAt > STALE_PROMPT_S;
  }

  // No live agent process for a LOCALLY dispatched prompt → the agent exited
  // or never launched, so the "Working" badge is a false positive. A sentinel
  // with source "inject" is only ever written by the local /api/inject and
  // /api/control/tab-inject routes (cloud skips the /tmp write), which means a
  // real /proc scan backs `agentRunning` here — it is authoritative. We wait
  // out AGENT_ABSENT_GRACE_S first so a freshly-dispatched prompt isn't killed
  // before its agent has had time to appear in /proc. Sentinels held by the
  // cloud runner (source "runner") are intentionally exempt: there is no local
  // /proc scan to trust, and the runner clears its own sentinel. This is the
  // fix for the stale "Working 20m" on an idle shell where a queued/never-
  // delivered dispatch left an "inject" sentinel with no agent behind it.
  if (
    project.currentPrompt.source === "inject" &&
    !project.agentRunning &&
    nowS - startedAt > AGENT_ABSENT_GRACE_S
  ) {
    return true;
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
  /** SSOT key for this state — index into STATE_DEFINITIONS for label,
   *  description, dot color, problem hint, counter category. All downstream
   *  consumers (chips, rows, banner, tooltip, agent prompt context) should
   *  read from here, not from the legacy `tone` / `stateLabel` fields. */
  stateKey: ProjectStateKey;
  /** Human-readable label for the state badge — derived from
   *  STATE_DEFINITIONS[stateKey].label (kept here for transitional access
   *  during the consumer migration; new code should call
   *  projectStateLabel(stateKey) directly). */
  stateLabel: string;
  /** Tailwind classes for the ui-tag badge — derived from
   *  STATE_DEFINITIONS[stateKey].tagClass. */
  stateTagClass: string;
};

/** Legacy ControlPhase enum — retained as an alias of ProjectStateKey while
 *  callers migrate. New code should use ProjectStateKey directly. The
 *  values are identical so the migration is purely nominal. */
export type ControlPhase = ProjectStateKey;

/** Status-dot color class per state. Sourced from the SSOT
 *  (`STATE_DEFINITIONS[k].dotClass`) so the dot, badge, tooltip, and counter
 *  cannot disagree — adding a state forces an explicit dot class in one
 *  place. The Record below is just a typed cache to keep call-site syntax
 *  stable for components that index it directly. */
export const PHASE_DOT_CLASS: Record<ControlPhase, string> = (Object.fromEntries(
  (Object.keys(STATE_DEFINITIONS) as ProjectStateKey[]).map((k) => [k, STATE_DEFINITIONS[k].dotClass]),
) as Record<ProjectStateKey, string>);

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

/** Truthful fleet-pulse for the Control hero. */
export type FleetPulse = {
  key: "paused" | "building" | "waiting" | "failing";
  label: string;
  /** Secondary sentence for the failing state (rendered with an Activity link). */
  detail: string | null;
};

const FAILED_OUTCOMES: ReadonlySet<string> = new Set(["error", "hang", "timeout"]);

/**
 * Derive what the fleet is ACTUALLY doing for the hero headline. The label
 * used to be `mode === "on" ? "Building" : "Paused"` — pure aspiration: it
 * showed "Building" with a pulsing green dot while 0 agents worked and every
 * recent run had failed (the 2026-07-02 dead-fleet incident sat behind a
 * green light for two days). Rules, in order:
 *   - autopilot off                        → "Paused"
 *   - any agent working right now          → "Building"
 *   - nothing working + the latest run of ≥2 projects failed and NONE
 *     succeeded                            → "Stalled" (+ detail, Activity link)
 *   - nothing working                      → "Waiting to dispatch"
 * user_abort counts as neutral (a human choice, not a systemic failure).
 */
export function deriveFleetPulse(input: {
  automationMode: string;
  workingCount: number;
  /** Latest outcome per project, only for projects that have any run history. */
  latestOutcomes: OrchestrationOutcome[];
}): FleetPulse {
  if (input.automationMode === "off") return { key: "paused", label: "Paused", detail: null };
  if (input.workingCount > 0) return { key: "building", label: "Building", detail: null };

  const failed = input.latestOutcomes.filter((o) => FAILED_OUTCOMES.has(o)).length;
  const succeeded = input.latestOutcomes.filter((o) => o === "success" || o === "partial").length;
  if (failed >= 2 && succeeded === 0) {
    return {
      key: "failing",
      label: "Stalled",
      detail: `The latest run on ${failed} projects failed and nothing is currently building.`,
    };
  }
  return { key: "waiting", label: "Waiting to dispatch", detail: null };
}

export type AttentionItem = {
  project: ProjectState;
  score: number;
  reason: string;
};

export type LiveTabRow = {
  tabName: string;
  project: ProjectState | null;
  agentLabel: string | null;
  /** SSOT key for this row's state, when a registered project backs it.
   *  Null for unmatched zellij tabs ("Open" rows). Consumers look up
   *  description + problem from STATE_DEFINITIONS via this key. */
  stateKey: ProjectStateKey | null;
  stateLabel: ProjectDisplayState["stateLabel"] | "Open";
  stateTagClass: string;
  /** Running prompt label, or null when the state badge already says it all. */
  activity: string | null;
  isWorking: boolean;
  isWaiting: boolean;
  registered: boolean;
};

type LiveTabRankLabel = LiveTabRow["stateLabel"];

const LIVE_TAB_RANK: Record<LiveTabRankLabel, number> = {
  Offline: 0,
  Working: 0,
  "Ready for next step": 1,
  "Awaiting input": 3,
  Closing: 2,
  Completed: 3,
  "Not running": 4,
  "Tab open": 4,
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
): string | null {
  // Returns the short activity string shown next to each workspace row, or
  // null when there is nothing to say beyond the state badge — every
  // non-running row used to repeat the badge text ("Awaiting input |
  // Awaiting input") which read as a rendering glitch.
  //
  // Critical rule (2026-05-31): NEVER paste raw handoff content (the agent's
  // own done/next/status notes) into the default row text. These were leaking
  // into the UI as "Saved handoff: ..." prefixes that exposed internal agent
  // bookkeeping to the user. Activity text is the running prompt's label
  // only; handoff content belongs in a per-project expand/tooltip.
  if (!project) return "Tab open — not registered in fleet";
  if (display?.isRunning && project.currentPrompt?.label) {
    return project.currentPrompt.label;
  }
  // Idle: surface the last activity event (dispatch or run outcome).
  const summary = latestActivitySummary(project.recentActivity ?? []);
  const lastAt = project.recentActivity?.[0]?.at;
  if (summary && lastAt) {
    return `${summary} · ${timeAgo(new Date(lastAt).getTime())}`;
  }
  return null;
}

export function buildLiveTabRows(
  zellijTabs: string[],
  projects: ProjectState[],
  nowS: number,
  syncStale = false,
): LiveTabRow[] {
  const uniqueTabs = [...new Set(zellijTabs.map((t) => t.trim()).filter(Boolean))];
  return uniqueTabs
    // 2026-05-31: skip zellij tabs that don't map to any registered project.
    // The user surfaced "Tab #1 Unlinked" as visible noise — scratch tabs
    // they opened manually that have nothing to do with the fleet. Their
    // real zellij window already shows them; the FleetCrown UI is for fleet
    // ops, not a generic tab list. To re-expose unregistered tabs later,
    // gate this on a "show all tabs" toggle in the UI.
    .map((tabName) => ({ tabName, project: findProjectForOpenTab(tabName, projects) }))
    .filter((entry): entry is { tabName: string; project: ProjectState } => entry.project !== null)
    .map(({ tabName, project }) => {
      const display = getProjectDisplayState(project, uniqueTabs, nowS, false, true, syncStale);
      // When a prompt is running but the /proc scan hasn't caught the agent
      // process yet (the brief launch window), prefer the dispatched adapter
      // ("Claude", "Cursor", …) over a bare generic "Agent" — but only when
      // it's a real adapter, not the "unknown" placeholder a raw tab-inject
      // writes (which would render a worse "Unknown").
      const dispatched = project.currentPrompt?.adapter;
      const dispatchedLabel = dispatched && dispatched !== "unknown"
        ? labelForProcessOrAdapter(dispatched)
        : null;
      const agentLabel = project.activeAgents.length
        ? formatAgentRuntimeLabel(project, tabName)
        : display.isRunning
          ? (dispatchedLabel ?? "Agent")
          : inferAgentLabelFromTabName(tabName);
      return {
        tabName,
        project,
        agentLabel: agentLabel || null,
        stateKey: display.stateKey,
        stateLabel: display.stateLabel,
        stateTagClass: display.stateTagClass,
        activity: getTabActivityText(project, display),
        isWorking: display.isRunning,
        isWaiting: display.isReady || display.isOrchestrationReady || display.tone === "session-open",
        registered: true,
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


export function getProjectDisplayState(
  project: ProjectState,
  zellijTabs: string[],
  nowS: number,
  dismissed = false,
  runtimeStateKnown = true,
  syncStale = false,
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
      stateKey: "offline",
      stateLabel: STATE_DEFINITIONS.offline.label,
      stateTagClass: STATE_DEFINITIONS.offline.tagClass,
    };
  }
  // Track active work from a fresh current-prompt sentinel. Do not require
  // agentRunning — cloud runner may hold a FleetCrown-dispatched prompt while
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

  // Labels and tag classes used to be a pair of Records here. Now they come
  // from STATE_DEFINITIONS in lib/control-states — adding a state requires
  // exactly one literal edit, and the badge + dot + chip + tooltip + agent
  // prompt context cannot disagree.

  // Map the legacy 8-value tone enum onto the SSOT 9-value ProjectStateKey.
  // The "idle + tabOpen" special case becomes its own first-class key, so the
  // badge, the dot color, and the agent prompt context all read the same.
  const TONE_TO_STATE_KEY: Record<ProjectDisplayState["tone"], ProjectStateKey> = {
    offline: "offline",
    running: "working",
    "session-open": "open_idle",
    ready: "ready",
    "orchestration-ready": "orchestration_ready",
    closing: "closing",
    closed: "completed",
    idle: "not_running",
  };
  const stateKey: ProjectStateKey =
    tone === "idle" && tabOpen && !isSessionOpen
      ? "tab_open"
      : TONE_TO_STATE_KEY[tone];

  // Runner sync is stale (cloud path, last push older than the offline
  // threshold): every runtime flag above was derived from that stale push and
  // can no longer be asserted as live. Collapse to the honest "offline" state —
  // no "Working" badge, no ticking running-banner, and not counted as working /
  // awaiting / idle — so the board stops claiming an agent is busy when the
  // runner may have died hours ago. `tabOpen` is preserved so the evidence
  // subtitle (buildProjectOperationsSnapshot) can still say "Last sync <ago>".
  // Never fires on the local runtime: runtimeAvailable ⇒ runnerSyncStale is
  // always false, so getProjectDisplayState is called with syncStale = false.
  if (syncStale) {
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
      tabOpen,
      tone: "offline",
      stateKey: "offline",
      stateLabel: STATE_DEFINITIONS.offline.label,
      stateTagClass: STATE_DEFINITIONS.offline.tagClass,
    };
  }

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
    stateKey,
    stateLabel: STATE_DEFINITIONS[stateKey].label,
    stateTagClass: STATE_DEFINITIONS[stateKey].tagClass,
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
  const display = getProjectDisplayState(project, zellijTabs, nowS, false, runtimeStateKnown, syncStale);
  // Phase IS stateKey now — the SSOT enum is the only enum. Operations
  // snapshot just exposes the same key under the legacy `phase` field for
  // callers mid-migration. Once those callers move, this whole block
  // collapses to `const phase = display.stateKey;`.
  const phase: ControlPhase = display.stateKey;
  const attention = attentionScore(project);
  const handoffAt = project.session?.mtime ?? null;
  const contextSummary = display.isRunning && project.currentPrompt?.label
    ? project.currentPrompt.label
    : project.session?.next?.trim()
      ? project.session.next.trim()
      : project.session?.done?.trim()
        ? project.session.done.trim()
        : null;
  // States that assert a live observation on the agent host. When the runner
  // sync is stale these claims come from the last push and may no longer be
  // true — the evidence line must say when they were observed, not pair the
  // claim with an unrelated handoff-file timestamp (pre-fix: "Awaiting input
  // 1w ago" — badge from a 34h-old push, timestamp from a week-old handoff,
  // reading as "the agent sat at the prompt for a week").
  const claimsLiveObservation =
    display.isRunning || display.isReady || display.isOrchestrationReady || display.isSessionOpen || display.tabOpen;
  const liveObserved = runtimeStateKnown && !syncStale && claimsLiveObservation;
  const latestActivity = project.recentActivity?.[0];
  const latestActivityAgeS = latestActivity?.at
    ? nowS - Math.floor(new Date(latestActivity.at).getTime() / 1000)
    : null;
  const recentDispatchSuffix =
    latestActivity &&
    latestActivity.kind === "dispatch" &&
    latestActivityAgeS !== null &&
    latestActivityAgeS >= 0 &&
    latestActivityAgeS < 30 * 60
      ? `Last dispatch ${timeAgo(new Date(latestActivity.at).getTime())}`
      : null;

  // Evidence labels are the LONG-form descriptions shown as subtitles next
  // to the badge. They INTENTIONALLY add detail the badge can't fit (e.g.,
  // "Agent signaled ready on connected computer" vs the badge's "Ready for
  // next step"). 2026-06-08: simplified "Agent shell waiting for
  // instructions" → "Awaiting input" so the subtitle matches the
  // badge wording — no need for two different ways to say the same thing
  // stacked on the same row.
  const liveEvidenceLabel = display.isRunning
    ? "Live agent process detected"
    : display.isReady
      ? "Agent signaled ready on connected computer"
      : display.isOrchestrationReady
        ? "Last run completed"
        : display.isSessionOpen
          ? "Awaiting input"
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
    : syncStale && claimsLiveObservation
      ? staleSyncLabel(lastSyncedAt)
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
    // A stale live-claim's only honest timestamp is the sync time (already in
    // the label) — attaching handoffAt here is what produced "Awaiting input
    // 1w ago".
    evidenceAt: liveObserved || (syncStale && claimsLiveObservation) ? null : handoffAt,
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
  const { syncStale = false } = syncCtx;
  return projects
    .map((project) => buildProjectOperationsSnapshot(project, zellijTabs, nowS, runtimeStateKnown, syncCtx))
    .sort((a, b) => compareProjects(a.project, b.project, zellijTabs, nowS, runtimeStateKnown, syncStale));
}

function compareProjects(
  a: ProjectState,
  b: ProjectState,
  zellijTabs: string[],
  nowS: number,
  runtimeStateKnown: boolean,
  syncStale = false,
): number {
  const aState = getProjectDisplayState(a, zellijTabs, nowS, false, runtimeStateKnown, syncStale);
  const bState = getProjectDisplayState(b, zellijTabs, nowS, false, runtimeStateKnown, syncStale);

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
  syncStale = false,
): ControlPageState {
  // Bucket every project by the SAME counterCategory the rail
  // (ProjectOperationsView) reads off each row's stateKey, so the header chips
  // and the rail counts come from one SSOT and can never disagree. Previously
  // the header's third number was openTabCount — every project with a zellij
  // tab open, a SUPERSET that double-counted the working/awaiting projects —
  // while the rail showed the mutually-exclusive idle bucket: the same screen
  // had "open" meaning two different numbers. Now both read working/waiting/
  // idle off counterCategory. syncStale collapses stale projects to the
  // "offline" category, so they drop out of all three live counts.
  const categories = data.projects.map((project) =>
    STATE_DEFINITIONS[
      getProjectDisplayState(project, data.zellijTabs, nowS, false, runtimeStateKnown, syncStale).stateKey
    ].counterCategory,
  );
  const runningCount = categories.filter((c) => c === "working").length;
  const waitingCount = categories.filter((c) => c === "waiting").length;
  const idleCount = categories.filter((c) => c === "idle").length;
  const openTabCount = data.projects.filter((project) => isProjectTabOpen(project, data.zellijTabs)).length;
  const controlProjectCount = data.inventory.controlProjectCount ?? 0;
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
