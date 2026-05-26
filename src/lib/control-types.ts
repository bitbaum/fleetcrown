import type { RecentCustomPrompt } from "@/db/queries/prompt-history";
import type { OrchestrationTaskSummary } from "@/lib/orchestration";
import type { OrchestrationOutcome } from "@/db/schema/orchestration-runs";

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
  /** Agent's self-reported lifecycle state: 'ready' = done, auto-inject may
   *  proceed; 'working' = mid-task, suppress auto-inject. Missing/undefined
   *  is treated as NOT ready by the auto-inject gates (conservative). Optional
   *  so legacy construction sites that don't yet plumb session_status can
   *  omit it during the back-compat window — they'll just suppress auto-fire
   *  which matches the user's stated intent. */
  status?: string;
  done: string;
  next: string;
  tests: string;
  todos: string;
  health: string;
  mtime: number; // epoch milliseconds
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
  readonly?: boolean;
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
  /** Last 5 outcomes for this project, newest first. Powers the streak chip + dispatch reasoner. */
  recentOutcomes: OrchestrationOutcome[];
  latestOrchestrationRun: {
    adapter: string;
    intent: string;
    state: string;
    startedAt: string;
    finishedAt: string | null;
    summary: OrchestrationTaskSummary | null;
    payload: {
      resultText?: string;
      error?: string;
      durationMs?: number;
      model?: string;
    } | null;
  } | null;
};

export type FailedCommand = {
  id: string;
  tab: string;
  type: string;
  error: string;
  executedAt: string;
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
  runtimeAvailable: boolean;
  daemonLastPushedAt: string | null;
  failedCommands: FailedCommand[];
};
