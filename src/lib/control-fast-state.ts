import fs from "fs";
import { sessionFilePath, stateFile } from "@/lib/agent-config";
import { SENTINEL_VALIDITY_S } from "@/lib/constants/control";
import { parseSessionFile } from "@/lib/session-content";
import type { CurrentPrompt, SessionState } from "@/lib/control-types";

export function parseSession(tab: string, adapter = "claude"): SessionState | null {
  const file = sessionFilePath(tab, adapter);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const fields = parseSessionFile(raw);
    const mtime = fs.statSync(file).mtimeMs;
    // Project the kebab-case loop-control fields into camelCase SessionState
    // shape. Kept narrow: only the two structured fields are surfaced; the
    // other kebab fields (last-3-same-dir, wip-or-revert-in-last-5) stay in
    // OrchestrationTaskSummary's purview and don't leak into ProjectState.
    const blockReasonRaw = fields["block-reason"]?.trim();
    const noOpCountRaw = fields["no-op-count"]?.trim();
    const noOpCount = noOpCountRaw && /^\d+$/.test(noOpCountRaw)
      ? parseInt(noOpCountRaw, 10)
      : undefined;
    return {
      ...fields,
      ...(blockReasonRaw ? { blockReason: blockReasonRaw } : {}),
      ...(noOpCount !== undefined ? { noOpCount } : {}),
      mtime,
    };
  } catch {
    return null;
  }
}

export function readTmpTs(filename: string): number | null {
  try {
    if (fs.existsSync(filename)) {
      const ts = parseInt(fs.readFileSync(filename, "utf-8").trim(), 10);
      return isNaN(ts) ? null : ts;
    }
  } catch { /* ignore */ }
  return null;
}

export function readCurrentPrompt(tab: string): CurrentPrompt | null {
  try {
    const file = stateFile.prompt(tab);
    if (!fs.existsSync(file)) return null;
    const obj = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (typeof obj?.key === "string" && typeof obj?.label === "string" && typeof obj?.startedAt === "number") {
      return obj as CurrentPrompt;
    }
  } catch { /* ignore */ }
  return null;
}

export function getAgentCwds(processMatchers: string[]): string[] {
  return getAgentProcesses(processMatchers.map((matcher) => ({
    id: matcher,
    processMatchers: [matcher],
    capabilities: { sessionLifecycleSignals: true },
  }))).map((process) => process.cwd);
}

export type AgentProcess = {
  agentId: string;
  cwd: string;
  sessionLifecycleSignals: boolean;
};

export function getAgentProcesses(
  agents: Array<{
    id: string;
    processMatchers: string[];
    capabilities: { sessionLifecycleSignals: boolean };
  }>
): AgentProcess[] {
  const processes: AgentProcess[] = [];
  try {
    for (const entry of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf-8");
        // Match against argv[0] basename only — a full-string scan of the whole
        // cmdline produces false positives when shell-snapshot scripts are run via
        // `/bin/bash -c source /home/g/.claude/shell-snapshots/...` (the path
        // contains "claude" but the process is just a bash helper, not the agent).
        const argv0 = cmdline.split("\0")[0] ?? "";
        const basename = argv0.includes("/") ? argv0.split("/").pop()! : argv0;
        const agent = agents.find((candidate) =>
          candidate.processMatchers.some((m) => {
            if (m === "agent" && candidate.id === "cursor") {
              return basename === "agent"
                && (argv0.includes(".local/bin/agent") || argv0.includes("/.cursor/"));
            }
            return basename === m || basename === `${m}.exe` || basename.startsWith(`${m}-`);
          }),
        );
        if (!agent) continue;
        const cwd = fs.readlinkSync(`/proc/${entry}/cwd`);
        processes.push({
          agentId: agent.id,
          cwd,
          sessionLifecycleSignals: agent.capabilities.sessionLifecycleSignals,
        });
      } catch {
        // process disappeared mid-scan
      }
    }
  } catch {
    // /proc unavailable
  }
  return processes;
}

export type FastProjectState = {
  tab: string;
  agentRunning: boolean;
  tabOpen: boolean;
  activeAgents: string[];
  session: SessionState | null;
  currentPrompt: CurrentPrompt | null;
  readyAt: number | null;
  lockAt: number | null;
  closingAt: number | null;
  closedAt: number | null;
};

export function readFastState(
  projects: Array<{ tab: string; dir: string; sessionLifecycleSignals?: boolean; activeAgents?: string[]; tabOpen?: boolean }>,
  agentCwds: string[]
): FastProjectState[] {
  const nowS = Math.floor(Date.now() / 1000);
  return projects.map(({ tab, dir, sessionLifecycleSignals = true, activeAgents = [], tabOpen = false }) => {
    const tmpReady   = readTmpTs(stateFile.ready(tab));
    const tmpLock    = readTmpTs(stateFile.lock(tab));
    const tmpClosing = readTmpTs(stateFile.closing(tab));
    const tmpClosed  = readTmpTs(stateFile.closed(tab));

    const rawCurrentPrompt = readCurrentPrompt(tab);
    const currentPrompt = sessionLifecycleSignals || rawCurrentPrompt?.source === "runner"
      ? rawCurrentPrompt
      : null;

    const liveAdapter = activeAgents[0] ?? "claude";
    return {
      tab,
      agentRunning: agentCwds.some((cwd) => cwd === dir || cwd.startsWith(dir + "/")),
      tabOpen,
      activeAgents,
      session: parseSession(tab, liveAdapter),
      currentPrompt,
      readyAt:   tmpReady   !== null && (nowS - tmpReady)   < SENTINEL_VALIDITY_S ? tmpReady   : null,
      lockAt:    tmpLock    !== null && (nowS - tmpLock)    < SENTINEL_VALIDITY_S ? tmpLock    : null,
      closingAt: tmpClosing !== null && (nowS - tmpClosing) < SENTINEL_VALIDITY_S ? tmpClosing : null,
      closedAt:  tmpClosed  !== null && (nowS - tmpClosed)  < SENTINEL_VALIDITY_S ? tmpClosed  : null,
    };
  });
}
