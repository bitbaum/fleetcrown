/**
 * Inline self-tests for control-presenter live tab mapping.
 * Run: npm run test:control-presenter
 */
import {
  buildLiveTabRows,
  buildProjectOperationsSnapshot,
  buildProjectOperationsSnapshots,
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
    recentInjections: [],
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
    const projects = [stubProject({ tab: "Cockpit", liveTab: "Cockpit" })];
    assert(findProjectForOpenTab("cockpit", projects)?.tab === "Cockpit", "expected Cockpit");
  });

  check("findProjectForOpenTab prefix match (agent suffix tab)", () => {
    const projects = [stubProject({ tab: "Cockpit", liveTab: "Cockpit Claude" })];
    assert(findProjectForOpenTab("Cockpit Claude", projects)?.tab === "Cockpit", "expected prefix match");
  });

  check("isProjectTabOpen accepts agent-suffixed live tabs", () => {
    const project = stubProject({ tab: "Cockpit", liveTab: "Cockpit" });
    assert(isProjectTabOpen(project, ["Cockpit Claude"]), "expected suffix tab to count as open");
    assert(!isProjectTabOpen(project, ["Cockpit2 Claude"]), "must not match unrelated prefixes");
  });

  check("isProjectTabOpen accepts a different live agent suffix than cached liveTab", () => {
    const project = stubProject({ tab: "Cockpit", liveTab: "Cockpit Claude" });
    assert(isProjectTabOpen(project, ["Cockpit Codex"]), "expected canonical project suffix to count as open");
  });

  check("buildLiveTabRows sorts Working before Open", () => {
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
    const rows = buildLiveTabRows(["Active", "Mystery"], projects, nowS);
    assert(rows[0]?.tabName === "Active", "working tab first");
    assert(rows[0]?.stateLabel === "Working", "working state");
    assert(rows[1]?.tabName === "Mystery", "unregistered second");
    assert(rows[1]?.registered === false, "unregistered flag");
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
    assert(inferAgentLabelFromTabName("Cockpit Codex") === "Codex", "expected Codex suffix");
    assert(inferAgentLabelFromTabName("ops-grok") === "Grok", "expected Grok suffix");
    assert(inferAgentLabelFromTabName("scratch") === null, "expected no inferred agent");
  });

  check("unknown daemon state suppresses cached working and ready signals", () => {
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
    const project = stubProject({ tab: "Cockpit" });
    const state = getProjectDisplayState(project, [], 1_700_000_000);
    assert(state.stateLabel === "Not running", "inactive project must describe the absent live signal");
  });

  check("snapshot separates saved context from current operational state", () => {
    const nowS = 1_700_000_000;
    const snapshot = buildProjectOperationsSnapshot(stubProject({
      tab: "Cockpit",
      session: { done: "Done earlier", next: "Continue later", tests: "", todos: "", health: "", mtime: (nowS - 300) * 1000 },
    }), [], nowS);
    assert(snapshot.phase === "not_running", "handoff must not imply a running agent");
    assert(snapshot.evidenceLabel === "Saved agent context", "handoff must be labeled historical");
    assert(snapshot.evidenceKind === "historical", "handoff provenance must be historical");
  });

  check("open session is not mislabeled as waiting for input", () => {
    const nowS = 1_700_000_000;
    const project = stubProject({ tab: "Cockpit", agentRunning: true });
    const state = getProjectDisplayState(project, ["Cockpit"], nowS);
    const snapshot = buildProjectOperationsSnapshot(project, ["Cockpit"], nowS);
    assert(state.stateLabel === "Waiting for instructions", "open inactive agent must describe the observed shell");
    assert(snapshot.phase === "open_idle", "open inactive agent must not count as waiting for input");
    assert(snapshot.evidenceLabel === "Agent shell waiting for instructions", "evidence should explain the live signal");
  });

  check("ready sentinel is a next-step state, not generic waiting", () => {
    const nowS = 1_700_000_000;
    const project = stubProject({ tab: "Cockpit", readyAt: nowS - 5 });
    const state = getProjectDisplayState(project, ["Cockpit"], nowS);
    const snapshot = buildProjectOperationsSnapshot(project, ["Cockpit"], nowS);
    assert(state.stateLabel === "Ready for next step", "ready signal must name the action state");
    assert(snapshot.phase === "waiting_for_user", "ready signal remains actionable");
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
      tab: "Cockpit",
      agentRunning: true,
      currentPrompt: { key: "custom", label: "Current work", startedAt: nowS - 10 },
      session: { done: "previous", next: "", tests: "", todos: "", health: "", mtime: (nowS - 20) * 1000 },
    });
    assert(!isCurrentPromptStale(project, nowS), "older handoff must not end current work");
    assert(getProjectDisplayState(project, ["Cockpit"], nowS).stateLabel === "Working", "fresh prompt must show Working");
  });

  check("direct-terminal observation is surfaced as Working", () => {
    // Daemon-side path for prompts the user typed directly into Claude (no
    // Cockpit dispatch sentinel). cockpit-daemon.sh sets currentPrompt.key to
    // "direct_terminal" with startedAt = the transcript's mtime when the tab is
    // open, no other prompt is tracked, and the agent has not just signaled
    // ready. The presenter must treat this exactly like any tracked prompt so
    // chips/badges read "Working" instead of falling through to "Agent shell
    // open" (the limitation 6da8d7e called out).
    const nowS = 1_700_000_100;
    const project = stubProject({
      tab: "Cockpit",
      agentRunning: true,
      activeAgents: ["claude"],
      currentPrompt: { key: "direct_terminal", label: "Direct terminal activity", startedAt: nowS - 3 },
    });
    const state = getProjectDisplayState(project, ["Cockpit"], nowS);
    assert(state.stateLabel === "Working", "direct-terminal observation must report Working");
    assert(state.isAgentWorking, "isAgentWorking is the SSOT chips read");
    const snapshot = buildProjectOperationsSnapshot(project, ["Cockpit"], nowS);
    assert(snapshot.phase === "working", "snapshot phase must match the badge");
    assert(snapshot.evidenceLabel === "Live agent process detected", "evidence must read live, not historical");
  });

  check("working handoff does not stale an active prompt", () => {
    const nowS = 1_700_000_100;
    const project = stubProject({
      tab: "Cockpit",
      agentRunning: false,
      currentPrompt: { key: "custom", label: "Still implementing", startedAt: nowS - 30 },
      session: { status: "working", done: "partial", next: "finish", tests: "", todos: "", health: "good", mtime: (nowS - 5) * 1000 },
    });
    assert(!isCurrentPromptStale(project, nowS), "status:working handoff must not clear Working");
    assert(getProjectDisplayState(project, ["Cockpit"], nowS).stateLabel === "Working",
      "fresh prompt must show Working without agentRunning");
  });

  check("handoff written after prompt marks it completed", () => {
    const nowS = 1_700_000_100;
    const project = stubProject({
      tab: "Cockpit",
      agentRunning: true,
      currentPrompt: { key: "custom", label: "Current work", startedAt: nowS - 20 },
      session: { done: "finished", next: "", tests: "", todos: "", health: "", mtime: (nowS - 5) * 1000 },
    });
    assert(isCurrentPromptStale(project, nowS), "newer handoff should end displayed work");
  });

  console.log(`\n${passed}/${passed} passed`);
}

runTests();
