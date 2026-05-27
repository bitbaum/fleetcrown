import fs from "fs";
import { stateFile } from "@/lib/agent-config";

/**
 * Best-effort local bridge for shell hooks. The database remains authoritative;
 * local runtime consumers read this mirror because they cannot query app state.
 */
export function writePromptQueueMirror(tab: string, queue: string[]): void {
  try {
    const file = stateFile.queue(tab);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(queue));
    fs.renameSync(`${file}.tmp`, file);
  } catch {
    // A missing local runtime or ephemeral serverless /tmp must not fail DB writes.
  }
}
