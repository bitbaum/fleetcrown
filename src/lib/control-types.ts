import type { RecentCustomPrompt } from "@/db/queries/prompt-history";

export type ProjectProfile = {
  description: string;
  status: string;
  maturity: string;
  stack: string;
  url: string;
  mission: string;
  attrs: Record<string, string>;
};

export type CurrentPrompt = {
  key: string;
  label: string;
  startedAt: number;
  source?: "inject" | "runner" | "hook" | "unknown";
  adapter?: string;
};

export type SessionState = {
  done: string;
  next: string;
  tests: string;
  todos: string;
  health: string;
  mtime: number;
};

export type GitState = {
  branch: string;
  lastMsg: string;
  lastWhen: string;
  dirty: boolean;
  dirtyCount: number;
  todayCount: number;
  /** Commits the remote is ahead of local HEAD (0 = in sync, requires fetch) */
  behindRemote: number;
  /** Last 5 commits formatted as "HASH DATE: MESSAGE" */
  recentCommits: string[];
};

export type ProjectState = {
  id: string | null;
  projectId: string | null;
  tab: string;
  liveTab: string;
  dir: string;
  agentPref: string | null;
  modelPref: string | null;
  session: SessionState | null;
  git: GitState | null;
  sessionLifecycleSignals: boolean;
  agentRunning: boolean;
  activeAgents: string[];
  profile: ProjectProfile | null;
  currentPrompt: CurrentPrompt | null;
  readyAt: number | null;
  lockAt: number | null;
  closingAt: number | null;
  closedAt: number | null;
  recentCustomPrompts: RecentCustomPrompt[];
  recentInjections: import("@/db/queries/prompt-history").ActivityItem[];
  latestOrchestrationRun: {
    adapter: string;
    intent: string;
    state: string;
    startedAt: string;
    finishedAt: string | null;
    summary: {
      done: string;
      next: string;
      tests: string;
      todos: string;
      health: string;
    } | null;
    payload: {
      resultText?: string;
      error?: string;
      durationMs?: number;
      model?: string;
    } | null;
  } | null;
};

export type ControlData = {
  agentRegistry: import("@/lib/agent-catalog").AgentCatalog;
  agentConfig: { agent: import("@/lib/agent-catalog").SwitchableAgent; model: string };
  orchestration: {
    manualPromptInjection: boolean;
    autonomousPromptLoop: boolean;
    sessionLifecycleSignals: boolean;
  };
  inventory: {
    source: "user_projects" | "projects_conf_fallback";
    trackedProjectCount: number;
    controlProjectCount: number;
    linkedDirectoryCount: number;
  };
  projects: ProjectState[];
  prompts: import("@/lib/agent-config").PromptMeta[];
  zellijTabs: string[];
  recentActivity: import("@/db/queries/prompt-history").ActivityItem[];
};
