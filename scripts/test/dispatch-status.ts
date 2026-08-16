/**
 * Inline tests for dispatch queue status copy.
 * Run: npx tsx scripts/test/dispatch-status.ts
 */
import { deriveDispatchLiveStatus, dispatchAssistantContent, dispatchStatusLabel } from "@/lib/dispatch-status";
import { EXECUTOR_COPY } from "@/config/executor-copy";
import { BUILDER_CHANNELS } from "@/lib/constants/statuses";

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

// ── Naming the builder ──────────────────────────────────────────────────────
//
// The operator should never have to wonder which machine has their work. Two
// rules, and the second matters more than the first: name it when we know, and
// NEVER name it when we don't — a label pointing at the wrong computer sends
// someone hunting through a checkout that never had the change.

const onLocal = dispatchStatusLabel({ mode: "direct", channel: "local" });
if (!onLocal.label.includes(EXECUTOR_COPY.ranOn.local) || onLocal.warn) {
  throw new Error("direct dispatch must name the local builder");
}

const onCloud = dispatchStatusLabel({ mode: "direct", channel: "cloud" });
if (!onCloud.label.includes(EXECUTOR_COPY.ranOn.cloud)) {
  throw new Error("direct dispatch must name the cloud builder");
}

// The highest-value case: nothing is happening, and this says which machine to
// wake rather than a generic "builder offline".
const offlineNamed = dispatchStatusLabel({
  mode: "queued",
  runnerConnected: false,
  warning: "runner-offline",
  channel: "local",
});
if (!offlineNamed.label.includes(EXECUTOR_COPY.ranOn.local) || !offlineNamed.warn) {
  throw new Error("offline queue must name the builder it is waiting on");
}

const queuedNamed = dispatchStatusLabel({ mode: "queued", runnerConnected: true, channel: "cloud" });
if (!queuedNamed.label.includes(EXECUTOR_COPY.ranOn.cloud) || queuedNamed.warn) {
  throw new Error("queued-with-builder must name the builder");
}

// Never guess. Messages persisted before routing was recorded carry no channel;
// they must fall back to the unnamed copy, not to a default machine.
for (const missing of [undefined, null]) {
  const bare = dispatchStatusLabel({ mode: "direct", channel: missing });
  if (bare.label !== "Running now") {
    throw new Error(`absent channel must not be named — got ${bare.label}`);
  }
  const bareQueued = dispatchStatusLabel({ mode: "queued", runnerConnected: true, channel: missing });
  if (bareQueued.label !== EXECUTOR_COPY.queuedWithBuilderOnline) {
    throw new Error(`absent channel must keep the unnamed queued copy — got ${bareQueued.label}`);
  }
}

// A failed dispatch names no machine: the failure, not the locus, is the point.
const failedNamed = dispatchStatusLabel({ ok: false, mode: "direct", channel: "cloud" });
if (failedNamed.label !== "Dispatch failed" || !failedNamed.warn) {
  throw new Error("failure copy must not be altered by the channel");
}

// The assistant transcript carries it too, so the chat log stays self-explaining.
const namedContent = dispatchAssistantContent("fleetcrown", {
  ok: true,
  mode: "queued",
  runnerConnected: true,
  channel: "cloud",
});
if (!namedContent.includes(EXECUTOR_COPY.ranOn.cloud)) {
  throw new Error("assistant content must name the builder");
}

// Every channel in the union has a name — no channel can render as "undefined".
for (const channel of BUILDER_CHANNELS) {
  const name = EXECUTOR_COPY.ranOn[channel];
  if (!name || typeof name !== "string") {
    throw new Error(`channel ${channel} has no operator-facing name`);
  }
  if (!dispatchStatusLabel({ mode: "direct", channel }).label.includes(name)) {
    throw new Error(`channel ${channel} is not surfaced in its label`);
  }
}

console.log("✓ dispatch-status tests passed");
