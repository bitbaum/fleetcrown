import fs from "fs";
import { stateFile } from "@/lib/agent-config";

// A tab becomes part of a /tmp filename (stateFile.queue), so a tab containing a
// path separator or ".." would escape /tmp and let an attacker-controlled `[tab]`
// route param write arbitrary JSON to a relative path. Reject those — the mirror
// is best-effort, so refusing a malformed tab is strictly safe.
function isSafeTab(tab: string): boolean {
  return tab.length > 0 && !tab.includes("/") && !tab.includes("\\") && !tab.includes("..");
}

/**
 * Best-effort local bridge for shell hooks. The database remains authoritative;
 * local runtime consumers read this mirror because they cannot query app state.
 */
export function writePromptQueueMirror(tab: string, queue: string[]): void {
  if (!isSafeTab(tab)) return;
  try {
    const file = stateFile.queue(tab);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(queue));
    fs.renameSync(`${file}.tmp`, file);
  } catch {
    // A missing local runtime or ephemeral serverless /tmp must not fail DB writes.
  }
}
