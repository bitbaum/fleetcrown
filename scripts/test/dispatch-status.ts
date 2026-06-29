/**
 * Inline tests for dispatch queue status copy.
 * Run: npx tsx scripts/test/dispatch-status.ts
 */
import { dispatchAssistantContent, dispatchStatusLabel } from "@/lib/dispatch-status";
import { EXECUTOR_COPY } from "@/config/executor-copy";

const offline = dispatchStatusLabel({ mode: "queued", runnerConnected: false, warning: "runner-offline" });
if (!offline.warn || offline.label !== EXECUTOR_COPY.queuedWhenOffline) {
  throw new Error("offline queued label");
}

const online = dispatchStatusLabel({ mode: "queued", runnerConnected: true });
if (online.warn || online.label !== EXECUTOR_COPY.queuedWithBuilderOnline) {
  throw new Error("online queued label");
}

const direct = dispatchStatusLabel({ mode: "direct" });
if (direct.warn || direct.label !== "Running now") {
  throw new Error("direct label");
}

const md = dispatchAssistantContent("fleetcrown", { ok: true, mode: "queued", runnerConnected: true });
if (!md.includes("fleetcrown") || !md.includes("builder")) {
  throw new Error("assistant content");
}

console.log("✓ dispatch-status tests passed");
