import fs from "fs";
import path from "path";
import { SESSIONS_DIR, stateFile } from "@/lib/claude-config";
import { ORCHESTRATION_TASK_SUMMARY_FIELDS } from "@/lib/orchestration";
import type { CurrentPrompt, SessionState } from "@/app/api/control/route";

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
  const cwds: string[] = [];
  try {
    for (const entry of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf-8");
        if (!processMatchers.some((matcher) => cmdline.includes(matcher))) continue;
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

const READY_WINDOW_S = 86400;

export function readFastState(
  projects: Array<{ tab: string; dir: string }>,
  agentCwds: string[]
): FastProjectState[] {
  const nowS = Math.floor(Date.now() / 1000);
  return projects.map(({ tab, dir }) => {
    const tmpReady   = readTmpTs(stateFile.ready(tab));
    const tmpClosing = readTmpTs(stateFile.closing(tab));
    const tmpClosed  = readTmpTs(stateFile.closed(tab));

    return {
      tab,
      agentRunning: agentCwds.some((cwd) => cwd === dir || cwd.startsWith(dir + "/")),
      session: parseSession(tab),
      currentPrompt: readCurrentPrompt(tab),
      readyAt:   tmpReady   !== null && (nowS - tmpReady)   < READY_WINDOW_S ? tmpReady   : null,
      closingAt: tmpClosing !== null && (nowS - tmpClosing) < READY_WINDOW_S ? tmpClosing : null,
      closedAt:  tmpClosed  !== null && (nowS - tmpClosed)  < READY_WINDOW_S ? tmpClosed  : null,
    };
  });
}
