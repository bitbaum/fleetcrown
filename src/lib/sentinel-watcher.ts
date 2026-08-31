import * as fs from "fs";
import { sseBus } from "./sse-bus";

// Watches /tmp for agent sentinel files written by the local runtime.
// On change, emits "sentinel-changed" on the SSE bus with the tab name.
// SSE stream subscribers filter by their own project tabs.
export function startSentinelWatcher(): () => void {
  const debounceMap = new Map<string, ReturnType<typeof setTimeout>>();
  let watcher: fs.FSWatcher | null = null;

  try {
    watcher = fs.watch("/tmp", { persistent: false }, (_, filename) => {
      if (!filename) return;
      const match = filename.match(
        /^agent-(?:ready|closing|closed|current-prompt|stop-active)-(.+)$/,
      );
      if (!match) return;
      const tab = match[1];
      const existing = debounceMap.get(tab);
      if (existing) clearTimeout(existing);
      debounceMap.set(
        tab,
        setTimeout(() => {
          debounceMap.delete(tab);
          sseBus.emit("sentinel-changed", tab);
        }, 50),
      );
    });
    console.log("[instrumentation] /tmp sentinel watcher started");
  } catch {
    console.warn("[instrumentation] /tmp watcher unavailable — skipping");
    return () => {};
  }

  return () => {
    watcher?.close();
    for (const t of debounceMap.values()) clearTimeout(t);
  };
}
