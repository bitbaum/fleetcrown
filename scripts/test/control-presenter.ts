/**
 * Inline self-tests for control-presenter live tab mapping.
 * Run: npm run test:control-presenter
 */
import {
  buildLiveTabRows,
  findProjectForOpenTab,
  formatAgentRuntimeLabel,
  getProjectDisplayState,
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

  console.log(`\n${passed}/${passed} passed`);
}

runTests();
