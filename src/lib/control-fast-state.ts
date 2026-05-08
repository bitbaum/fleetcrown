import fs from "fs";
import path from "path";
import { SESSIONS_DIR, stateFile } from "@/lib/agent-config";
import { ORCHESTRATION_TASK_SUMMARY_FIELDS } from "@/lib/orchestration";
import { SENTINEL_VALIDITY_S } from "@/lib/constants/control";
import type { CurrentPrompt, SessionState } from "@/lib/control-types";

export function parseSession(tab: string): SessionState | null {
  const file = path.join(SESSIONS_DIR, `${tab}.md`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const fields: Record<string, string> = {};
    const fieldPattern = ORCHESTRATION_TASK_SUMMARY_FIELDS.join("|");
    for (const line of raw.split("\n")) {
      const m = line.match(new RegExp(`^(${fieldPattern}):\\s*(.*)`));
      if (m) fields[m[1]] = m[2].trim();
    }
    const mtime = fs.statSync(file).mtimeMs;
    return {
      done:   fields.done  ?? "",
      next:   fields.next  ?? "",
      tests:  fields.tests ?? "",
      todos:  fields.todos ?? "",
      health: fields.health ?? "",
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
    let file = stateFile.prompt(tab);
    if (!fs.existsSync(file)) {
      file = stateFile.claudePrompt(tab);
    }
    if (!fs.existsSync(file)) return null;
    const obj = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (typeof obj?.key === "string" && typeof obj?.label === "string" && typeof obj?.startedAt === "number") {
      return obj as CurrentPrompt;
    }
  } catch { /* ignore */ }
  return null;
}

export function getAgentCwds(processMatchers: string[]): string[] {
  const cwds: string[] = [];
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
        if (!processMatchers.some(
          (m) => basename === m || basename === `${m}.exe` || basename.startsWith(`${m}-`),
        )) continue;
        cwds.push(fs.readlinkSync(`/proc/${entry}/cwd`));
      } catch {
        // process disappeared mid-scan
      }
    }
  } catch {
    // /proc unavailable
  }
  return cwds;
}

export type FastProjectState = {
  tab: string;
  agentRunning: boolean;
  session: SessionState | null;
  currentPrompt: CurrentPrompt | null;
  readyAt: number | null;
  closingAt: number | null;
  closedAt: number | null;
};

export function readFastState(
  projects: Array<{ tab: string; dir: string }>,
  agentCwds: string[]
): FastProjectState[] {
  const nowS = Math.floor(Date.now() / 1000);
  return projects.map(({ tab, dir }) => {
    const tmpReady   = readTmpTs(stateFile.ready(tab))   ?? readTmpTs(stateFile.claudeReady(tab));
    const tmpClosing = readTmpTs(stateFile.closing(tab)) ?? readTmpTs(stateFile.claudeClosing(tab));
    const tmpClosed  = readTmpTs(stateFile.closed(tab))  ?? readTmpTs(stateFile.claudeClosed(tab));

    return {
      tab,
      agentRunning: agentCwds.some((cwd) => cwd === dir || cwd.startsWith(dir + "/")),
      session: parseSession(tab),
      currentPrompt: readCurrentPrompt(tab),
      readyAt:   tmpReady   !== null && (nowS - tmpReady)   < SENTINEL_VALIDITY_S ? tmpReady   : null,
      closingAt: tmpClosing !== null && (nowS - tmpClosing) < SENTINEL_VALIDITY_S ? tmpClosing : null,
      closedAt:  tmpClosed  !== null && (nowS - tmpClosed)  < SENTINEL_VALIDITY_S ? tmpClosed  : null,
    };
  });
}
