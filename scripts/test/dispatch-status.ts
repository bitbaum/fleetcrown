/**
 * Inline tests for dispatch queue status copy.
 * Run: npx tsx scripts/test/dispatch-status.ts
 */
import { deriveDispatchLiveStatus, dispatchAssistantContent, dispatchStatusLabel } from "@/lib/dispatch-status";
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
if (!md.includes("fleetcrown") || !md.includes("builder") || md.includes("Dispatched")) {
  throw new Error("assistant content");
}

const fallback = dispatchStatusLabel({});
if (fallback.label !== EXECUTOR_COPY.honesty.queued) {
  throw new Error("fallback queued label");
}

const delivered = deriveDispatchLiveStatus({
  claimedAt: new Date(),
  executedAt: new Date(),
  result: { ok: true, verified: true },
  run: { state: "waiting", outcome: null },
});
if (delivered.label !== "Delivered to agent" || delivered.terminal) {
  throw new Error("tracked delivery must keep polling");
}

const completed = deriveDispatchLiveStatus({
  claimedAt: new Date(),
  executedAt: new Date(),
  result: { ok: true, verified: true },
  run: { state: "done", outcome: "success" },
});
if (completed.label !== "Completed" || !completed.terminal || completed.tone !== "positive") {
  throw new Error("successful run completion");
}

const timeout = deriveDispatchLiveStatus({
  claimedAt: new Date(),
  executedAt: new Date(),
  result: { ok: true, verified: true },
  run: { state: "error", outcome: "timeout", payload: { error: "timed out" } },
});
if (timeout.label !== "Run timed out" || !timeout.terminal || timeout.tone !== "negative") {
  throw new Error("timed out run completion");
}

console.log("✓ dispatch-status tests passed");
