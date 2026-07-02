/**
 * Inline self-tests for control-presenter live tab mapping.
 * Run: npm run test:control-presenter
 */
import {
  buildLiveTabRows,
  buildProjectOperationsSnapshot,
  buildProjectOperationsSnapshots,
  deriveFleetPulse,
  findProjectForOpenTab,
  formatAgentRuntimeLabel,
  inferAgentLabelFromTabName,
  getProjectDisplayState,
  isProjectTabOpen,
  isCurrentPromptStale,
} from "@/components/control/control-presenter";
import type { ProjectState } from "@/lib/control-types";

function stubProject(overrides: Partial<ProjectState> & Pick<ProjectState, "tab">): ProjectState {
  return {
    id: "1",
    projectId: null,
    liveTab: overrides.tab,
    dir: "/tmp/proj",
    agentPref: "claude",
    modelPref: null,
    session: null,
    git: null,
    sessionLifecycleSignals: true,
    agentRunning: false,
    activeAgents: [],
    profile: null,
    currentPrompt: null,
    readyAt: null,
    lockAt: null,
    closingAt: null,
    closedAt: null,
    recentCustomPrompts: [],
    recentActivity: [],
    recentOutcomes: [],
    latestOrchestrationRun: null,
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  check("findProjectForOpenTab exact match", () => {
    const projects = [stubProject({ tab: "FleetCrown", liveTab: "FleetCrown" })];
    assert(findProjectForOpenTab("FleetCrown", projects)?.tab === "FleetCrown", "expected FleetCrown");
  });

  check("findProjectForOpenTab prefix match (agent suffix tab)", () => {
    const projects = [stubProject({ tab: "FleetCrown", liveTab: "FleetCrown Claude" })];
    assert(findProjectForOpenTab("FleetCrown Claude", projects)?.tab === "FleetCrown", "expected prefix match");
  });

  check("isProjectTabOpen accepts agent-suffixed live tabs", () => {
    const project = stubProject({ tab: "FleetCrown", liveTab: "FleetCrown" });
    assert(isProjectTabOpen(project, ["FleetCrown Claude"]), "expected suffix tab to count as open");
    assert(!isProjectTabOpen(project, ["Cockpit2 Claude"]), "must not match unrelated prefixes");
  });

  check("isProjectTabOpen accepts a different live agent suffix than cached liveTab", () => {
    const project = stubProject({ tab: "FleetCrown", liveTab: "FleetCrown Claude" });
    assert(isProjectTabOpen(project, ["FleetCrown Codex"]), "expected canonical project suffix to count as open");
  });

  check("buildLiveTabRows sorts Working before Open and drops unregistered tabs", () => {
    // 2026-05-31: unregistered ("Tab #1 Unlinked") tabs are filtered out
    // of the default rows — they were visible noise that mapped to no
    // project. Test asserts the new filter behavior.
    const nowS = 1_700_000_000;
    const projects = [
      stubProject({
        tab: "IdleProj",
        liveTab: "IdleProj",
        agentRunning: false,
      }),
      stubProject({
        tab: "Active",
        liveTab: "Active",
        agentRunning: true,
        currentPrompt: { key: "k", label: "Fix tests", startedAt: nowS - 10 },
        activeAgents: ["claude"],
      }),
    ];
    const rows = buildLiveTabRows(["Active", "IdleProj", "Mystery"], projects, nowS);
    assert(rows.length === 2, `expected 2 rows (Mystery dropped as unregistered), got ${rows.length}`);
    assert(rows[0]?.tabName === "Active", "working tab first");
    assert(rows[0]?.stateLabel === "Working", "working state");
    assert(rows[1]?.tabName === "IdleProj", "registered idle tab second");
    assert(rows.every((r) => r.registered === true), "no unregistered tabs in output");
  });

  check("formatAgentRuntimeLabel maps cursor agent id", () => {
    const label = formatAgentRuntimeLabel(stubProject({
      tab: "X",
      activeAgents: ["cursor"],
    }));
    assert(label === "Cursor", `expected Cursor, got ${label}`);
  });

  check("formatAgentRuntimeLabel maps legacy agent basename", () => {
    const label = formatAgentRuntimeLabel(stubProject({
      tab: "X",
      activeAgents: ["agent"],
    }));
    assert(label === "Cursor", `expected Cursor, got ${label}`);
  });

  check("inferAgentLabelFromTabName reads common agent suffixes", () => {
    assert(inferAgentLabelFromTabName("FleetCrown Codex") === "Codex", "expected Codex suffix");
    assert(inferAgentLabelFromTabName("ops-grok") === "Grok", "expected Grok suffix");
    assert(inferAgentLabelFromTabName("scratch") === null, "expected no inferred agent");
  });

  check("unknown runner state suppresses cached working and ready signals", () => {
    const nowS = 1_700_000_000;
    const project = stubProject({
      tab: "Disconnected",
      agentRunning: true,
      currentPrompt: { key: "custom", label: "Never delivered", startedAt: nowS - 10 },
      readyAt: nowS - 10,
      activeAgents: ["claude"],
    });
    const state = getProjectDisplayState(project, ["Disconnected"], nowS, false, false);
    assert(state.stateLabel === "Offline", "disconnected card must say Offline");
    assert(!state.isRunning && !state.isReady && !state.tabOpen, "stale live signals must be hidden");
  });

  check("no detected process is reported as not running, not inferred activity", () => {
    const project = stubProject({ tab: "FleetCrown" });
    const state = getProjectDisplayState(project, [], 1_700_000_000);
    assert(state.stateLabel === "Not running", "inactive project must describe the absent live signal");
  });

  check("snapshot separates saved context from current operational state", () => {
    const nowS = 1_700_000_000;
    const snapshot = buildProjectOperationsSnapshot(stubProject({
      tab: "FleetCrown",
      session: { done: "Done earlier", next: "Continue later", tests: "", todos: "", health: "", mtime: (nowS - 300) * 1000 },
    }), [], nowS);
    assert(snapshot.phase === "not_running", "handoff must not imply a running agent");
    assert(snapshot.evidenceLabel === "Idle", "handoff must be labeled Idle (was 'Saved agent context' until the 2026-05-31 wording rewrite)");
    assert(snapshot.evidenceKind === "historical", "handoff provenance must be historical");
  });

  check("open session is labeled 'Awaiting input' to match the summary chip", () => {
    const nowS = 1_700_000_000;
    const project = stubProject({ tab: "FleetCrown", agentRunning: true });
    const state = getProjectDisplayState(project, ["FleetCrown"], nowS);
    const snapshot = buildProjectOperationsSnapshot(project, ["FleetCrown"], nowS);
    // Previous label "Waiting for instructions" implied the project itself was
    // dormant when really the only known fact is "agent process detected, no
    // recent handoff signal" — actionable wording matches the summary section
    // ("X awaiting input") so the row + chip agree.
    assert(state.stateLabel === "Awaiting input", "open inactive agent must read as awaiting your next prompt");
    assert(snapshot.phase === "open_idle", "open_idle phase is still the underlying state");
    assert(snapshot.evidenceLabel === "Awaiting input", "evidence label must match the badge wording");
  });

  check("ready sentinel is a next-step state, not generic waiting", () => {
    const nowS = 1_700_000_000;
    const project = stubProject({ tab: "FleetCrown", readyAt: nowS - 5 });
    const state = getProjectDisplayState(project, ["FleetCrown"], nowS);
    const snapshot = buildProjectOperationsSnapshot(project, ["FleetCrown"], nowS);
    assert(state.stateLabel === "Ready for next step", "ready signal must name the action state");
    assert(snapshot.phase === "ready", "ready signal remains actionable");
    assert(snapshot.evidenceLabel === "Agent signaled ready on connected computer", "ready evidence should identify the signal");
  });

  check("operations list prioritizes projects waiting for user action", () => {
    const nowS = 1_700_000_000;
    const snapshots = buildProjectOperationsSnapshots([
      stubProject({
        tab: "Working",
        agentRunning: true,
        currentPrompt: { key: "custom", label: "Implementing", startedAt: nowS - 5 },
      }),
      stubProject({ tab: "Waiting", agentRunning: true, readyAt: nowS - 5 }),
      stubProject({ tab: "Stopped" }),
    ], ["Working", "Waiting"], nowS);
    assert(snapshots.map(({ project }) => project.tab).join(",") === "Waiting,Working,Stopped", "actionable ordering expected");
  });

  check("closing lifecycle takes precedence over an open process in the snapshot", () => {
    const nowS = 1_700_000_000;
    const snapshot = buildProjectOperationsSnapshot(stubProject({
      tab: "Closing",
      agentRunning: true,
      closingAt: nowS - 2,
    }), ["Closing"], nowS);
    assert(snapshot.display.stateLabel === "Closing", "badge must report closing");
    assert(snapshot.phase === "closing", "rail phase must agree with the badge");
  });

  check("millisecond handoff mtime does not make a fresh prompt stale", () => {
    const nowS = 1_700_000_100;
    const project = stubProject({
      tab: "FleetCrown",
      agentRunning: true,
      currentPrompt: { key: "custom", label: "Current work", startedAt: nowS - 10 },
      session: { done: "previous", next: "", tests: "", todos: "", health: "", mtime: (nowS - 20) * 1000 },
    });
    assert(!isCurrentPromptStale(project, nowS), "older handoff must not end current work");
    assert(getProjectDisplayState(project, ["FleetCrown"], nowS).stateLabel === "Working", "fresh prompt must show Working");
  });

  check("direct-terminal observation is surfaced as Working", () => {
    // Runner-side path for prompts the user typed directly into Claude (no
    // FleetCrown dispatch sentinel). fleetcrown-daemon.sh sets currentPrompt.key to
    // "direct_terminal" with startedAt = the transcript's mtime when the tab is
    // open, no other prompt is tracked, and the agent has not just signaled
    // ready. The presenter must treat this exactly like any tracked prompt so
    // chips/badges read "Working" instead of falling through to "Agent shell
    // open" (the limitation 6da8d7e called out).
    const nowS = 1_700_000_100;
    const project = stubProject({
      tab: "FleetCrown",
      agentRunning: true,
      activeAgents: ["claude"],
      currentPrompt: { key: "direct_terminal", label: "Direct terminal activity", startedAt: nowS - 3 },
    });
    const state = getProjectDisplayState(project, ["FleetCrown"], nowS);
    assert(state.stateLabel === "Working", "direct-terminal observation must report Working");
    assert(state.isAgentWorking, "isAgentWorking is the SSOT chips read");
    const snapshot = buildProjectOperationsSnapshot(project, ["FleetCrown"], nowS);
    assert(snapshot.phase === "working", "snapshot phase must match the badge");
    assert(snapshot.evidenceLabel === "Live agent process detected", "evidence must read live, not historical");
  });

  check("working handoff does not stale an active prompt", () => {
    const nowS = 1_700_000_100;
    const project = stubProject({
      tab: "FleetCrown",
      agentRunning: false,
      currentPrompt: { key: "custom", label: "Still implementing", startedAt: nowS - 30 },
      session: { status: "working", done: "partial", next: "finish", tests: "", todos: "", health: "good", mtime: (nowS - 5) * 1000 },
    });
    assert(!isCurrentPromptStale(project, nowS), "status:working handoff must not clear Working");
    assert(getProjectDisplayState(project, ["FleetCrown"], nowS).stateLabel === "Working",
      "fresh prompt must show Working without agentRunning");
  });

  check("handoff written after prompt marks it completed", () => {
    const nowS = 1_700_000_100;
    const project = stubProject({
      tab: "FleetCrown",
      agentRunning: true,
      currentPrompt: { key: "custom", label: "Current work", startedAt: nowS - 20 },
      session: { done: "finished", next: "", tests: "", todos: "", health: "", mtime: (nowS - 5) * 1000 },
    });
    assert(isCurrentPromptStale(project, nowS), "newer handoff should end displayed work");
  });

  check("fleet pulse: off → Paused regardless of outcomes", () => {
    const pulse = deriveFleetPulse({ automationMode: "off", workingCount: 3, latestOutcomes: ["error", "error"] });
    assert(pulse.key === "paused", "off must be paused");
  });

  check("fleet pulse: any working agent → Building", () => {
    const pulse = deriveFleetPulse({ automationMode: "on", workingCount: 1, latestOutcomes: ["error", "error"] });
    assert(pulse.key === "building", "working agents mean building even with past failures");
  });

  check("fleet pulse: 0 working + all latest runs failed → Stalled", () => {
    // The 2026-07-02 dead-fleet shape: autopilot on, nothing working, every
    // project's latest run a timeout — must NOT read "Building".
    const pulse = deriveFleetPulse({ automationMode: "on", workingCount: 0, latestOutcomes: ["timeout", "timeout", "error"] });
    assert(pulse.key === "failing", "all-failed fleet must surface as failing");
    assert(!!pulse.detail, "failing pulse carries a detail sentence");
  });

  check("fleet pulse: one failure among successes → Waiting, not Stalled", () => {
    const pulse = deriveFleetPulse({ automationMode: "on", workingCount: 0, latestOutcomes: ["error", "success", "partial"] });
    assert(pulse.key === "waiting", "a single failing project must not panic the hero");
  });

  check("fleet pulse: 0 working, no history → Waiting to dispatch", () => {
    const pulse = deriveFleetPulse({ automationMode: "on", workingCount: 0, latestOutcomes: [] });
    assert(pulse.key === "waiting", "quiet fleet with autopilot on is waiting, not building");
  });

  check("fleet pulse: user_abort is neutral, not a systemic failure", () => {
    const pulse = deriveFleetPulse({ automationMode: "on", workingCount: 0, latestOutcomes: ["user_abort", "timeout"] });
    assert(pulse.key === "waiting", "aborts are human choices — only real failures stall the hero");
  });

  console.log(`\n${passed}/${passed} passed`);
}

runTests();
