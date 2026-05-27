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
  getProjectDisplayState,
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

  check("open session waiting for input has one explicit user-facing label", () => {
    const state = getProjectDisplayState(stubProject({ tab: "Cockpit", agentRunning: true }), ["Cockpit"], 1_700_000_000);
    assert(state.stateLabel === "Waiting for you", "open inactive agent must explain the required action");
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
