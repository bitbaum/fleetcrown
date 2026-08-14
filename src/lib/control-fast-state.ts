import fs from "fs";
import { resolveSessionFile, stateFile } from "@/lib/agent-config";
import { SENTINEL_VALIDITY_S } from "@/lib/constants/control";
import { parseSessionFile } from "@/lib/session-content";
import type { CurrentPrompt, SessionState } from "@/lib/control-types";

export function parseSession(tab: string, adapter = "claude"): SessionState | null {
  const file = resolveSessionFile(tab, adapter);
  if (!file) return null;
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

export type AgentProcess = {
  agentId: string;
  cwd: string;
  sessionLifecycleSignals: boolean;
  /** OS pid. Lets callers key a process stably and read its /proc entry. */
  pid: number;
  /**
   * Zellij's own pane id for the pane this process runs in, read from the
   * inherited ZELLIJ_PANE_ID. This is the ONLY reliable way to say which tab
   * an agent is in: zellij's dump-layout emits bare panes with no cwd or
   * command, and a default-named tab ("Tab #3") shares no string with the
   * project dir. Joined against the session's pane→tab_position map.
   * Undefined when the process wasn't started inside zellij.
   */
  zellijPaneId?: number;
  /** Zellij session the pane belongs to — pane ids are only unique within one. */
  zellijSession?: string;
};

/**
 * Read the zellij pane a process belongs to from its inherited environment.
 * Zellij exports ZELLIJ_PANE_ID / ZELLIJ_SESSION_NAME into every pane's shell,
 * and children (the agent CLI) inherit them — so this survives the agent being
 * launched through wrappers like `systemd-inhibit`.
 */
function readZellijPane(pid: string): { paneId: number; session: string } | null {
  try {
    const env = fs.readFileSync(`/proc/${pid}/environ`, "utf-8");
    let paneId: number | undefined;
    let session: string | undefined;
    for (const pair of env.split("\0")) {
      if (pair.startsWith("ZELLIJ_PANE_ID=")) {
        const n = Number(pair.slice("ZELLIJ_PANE_ID=".length));
        if (Number.isInteger(n)) paneId = n;
      } else if (pair.startsWith("ZELLIJ_SESSION_NAME=")) {
        session = pair.slice("ZELLIJ_SESSION_NAME=".length);
      }
    }
    if (paneId === undefined || !session) return null;
    return { paneId, session };
  } catch {
    // Not readable (permissions, process gone) — caller treats as unknown.
    return null;
  }
}

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
        const zellij = readZellijPane(entry);
        processes.push({
          agentId: agent.id,
          cwd,
          sessionLifecycleSignals: agent.capabilities.sessionLifecycleSignals,
          pid: Number(entry),
          zellijPaneId: zellij?.paneId,
          zellijSession: zellij?.session,
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

/** One live Claude Code session as reported by the CLI itself. */
export type ClaudeLiveSession = {
  pid: number;
  cwd: string;
  /** "idle" (at the composer) vs anything else (generating/working). */
  status: string;
  /** Epoch seconds of the last status flip. */
  statusUpdatedAtS: number;
};

/**
 * Claude Code (>= 2.x) writes live per-PID session status to
 * ~/.claude/sessions/<pid>.json ({cwd, status, statusUpdatedAt}). This is the
 * CLI's OWN ground truth for "is the agent generating right now" — no hooks,
 * no handoff files. Two consumers:
 *   - dispatch verification (poller): "did the injected prompt actually
 *     submit" = status leaves "idle". The old output-activity heuristic was
 *     fooled by boot-screen redraw, acking "injected" while the paste had
 *     been eaten by the trust-folder dialog (2026-07-02: six agents launched,
 *     all idle, all acked ok).
 *   - runtime pusher (readFastState): synthesizes the "direct_terminal"
 *     observation for agents with no prompt state file (headless box).
 * Dead PIDs are skipped — a killed agent must not leave a forever-"working"
 * ghost. Newest statusUpdatedAt wins per cwd.
 */
export function readClaudeLiveSessions(): Map<string, ClaudeLiveSession> {
  const byCwd = new Map<string, ClaudeLiveSession>();
  const dir = `${process.env.HOME ?? ""}/.claude/sessions`;
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return byCwd; // no session dir — older CLI or non-claude agent
  }
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf-8")) as {
        pid?: number; cwd?: string; status?: string; statusUpdatedAt?: number;
      };
      if (!raw.pid || !raw.cwd || typeof raw.status !== "string") continue;
      if (!fs.existsSync(`/proc/${raw.pid}`)) continue; // stale file, dead agent
      const entry: ClaudeLiveSession = {
        pid: raw.pid,
        cwd: raw.cwd,
        status: raw.status,
        statusUpdatedAtS: Math.floor((raw.statusUpdatedAt ?? 0) / 1000),
      };
      const prev = byCwd.get(raw.cwd);
      if (!prev || entry.statusUpdatedAtS > prev.statusUpdatedAtS) byCwd.set(raw.cwd, entry);
    } catch { /* unreadable/partial write — skip */ }
  }
  return byCwd;
}

/** Newest live Claude session running in `dir` (or a subdirectory of it). */
export function claudeLiveSessionForDir(
  sessions: Map<string, ClaudeLiveSession>,
  dir: string,
): ClaudeLiveSession | null {
  let best: ClaudeLiveSession | null = null;
  for (const [cwd, s] of sessions) {
    if (cwd !== dir && !cwd.startsWith(`${dir}/`)) continue;
    if (!best || s.statusUpdatedAtS > best.statusUpdatedAtS) best = s;
  }
  return best;
}

export type FastProjectState = {
  tab: string;
  workspaceId?: string | null;
  agentRunning: boolean;
  tabOpen: boolean;
  activeAgents: string[];
  session: SessionState | null;
  currentPrompt: CurrentPrompt | null;
  readyAt: number | null;
  lockAt: number | null;
  closingAt: number | null;
  closedAt: number | null;
  // Per-tab state previously fetched by per-card polling. Always set when the
  // stream sources from the DB; left undefined by the local /proc path so the
  // hook-side fallback still does a one-shot HTTP load.
  promptQueue?: string[];
  promptQueueRevision?: number;
  autoContinueEnabled?: boolean;
};

export function readFastState(
  projects: Array<{ tab: string; dir: string; sessionLifecycleSignals?: boolean; activeAgents?: string[]; tabOpen?: boolean }>,
  agentCwds: string[]
): FastProjectState[] {
  const nowS = Math.floor(Date.now() / 1000);
  const liveSessions = readClaudeLiveSessions();
  return projects.map(({ tab, dir, sessionLifecycleSignals = true, activeAgents = [], tabOpen = false }) => {
    const tmpReady   = readTmpTs(stateFile.ready(tab));
    const tmpLock    = readTmpTs(stateFile.lock(tab));
    const tmpClosing = readTmpTs(stateFile.closing(tab));
    const tmpClosed  = readTmpTs(stateFile.closed(tab));

    const rawCurrentPrompt = readCurrentPrompt(tab);
    let currentPrompt = sessionLifecycleSignals || rawCurrentPrompt?.source === "runner"
      ? rawCurrentPrompt
      : null;
    // No prompt state file (headless box: nothing writes /tmp prompt state)
    // but the CLI itself says it is generating → surface it as the
    // direct-terminal observation so the agent reads as Working instead of
    // "process detected, no lifecycle signal".
    if (!currentPrompt) {
      const live = claudeLiveSessionForDir(liveSessions, dir);
      if (live && live.status !== "idle") {
        currentPrompt = {
          key: "direct_terminal",
          label: "Direct terminal activity",
          startedAt: live.statusUpdatedAtS,
        };
      }
    }

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
