/**
 * Proves the LocalPtyExecutor round-trips end-to-end: spawn a PTY, capture its
 * output, write input, observe event-sourced status transitions, and replay the
 * buffer to a late (reconnecting) subscriber. No framework — run with:
 *   npx tsx scripts/test/executor.ts
 */
import { LocalPtyExecutor } from "../../src/lib/agent-execution/local-pty";
import type { AgentEvent } from "../../src/lib/agent-execution/types";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await sleep(25);
  }
  return pred();
}

async function main() {
  const executor = new LocalPtyExecutor();
  const events: AgentEvent[] = [];
  const id = "test:roundtrip";

  const handle = await executor.provision({ id, cwd: process.cwd(), command: "bash", args: ["--norc", "--noprofile"] });
  check("provision returns a handle with the given id", handle.id === id);
  check("initial status is 'starting'", handle.status === "starting");

  executor.subscribe(id, 0, (e) => events.push(e));

  // Write a command; the PTY should echo it and run it.
  executor.write(id, "echo HELLO_FLEET_$((6*7))\r");
  const sawOutput = await waitFor(() => events.some((e) => e.kind === "output" && e.data?.includes("HELLO_FLEET_42")));
  check("output round-trips (command ran in the owned PTY)", sawOutput);

  const wentRunning = await waitFor(() => events.some((e) => e.kind === "status" && e.status === "running"));
  check("status transitioned to 'running' on output", wentRunning);
  check("get() reflects a live status", executor.get(id)?.status === "running" || executor.get(id)?.status === "idle");

  // After the quiet period it should flip to idle (≈ awaiting input).
  const wentIdle = await waitFor(() => executor.get(id)?.status === "idle", 4000);
  check("status flips to 'idle' after the quiet period", wentIdle);

  // Monotonic, ordered sequence numbers (the reconnect contract).
  const seqs = events.map((e) => e.seq);
  const monotonic = seqs.every((s, i) => i === 0 || s > seqs[i - 1]);
  check("event seq is strictly monotonic", monotonic);

  // Reconnect replay: a late subscriber with sinceSeq=0 gets the full retained history.
  const replayed: AgentEvent[] = [];
  executor.subscribe(id, 0, (e) => replayed.push(e));
  check("late subscriber replays retained history", replayed.some((e) => e.data?.includes("HELLO_FLEET_42")));
  check("replay only returns events after sinceSeq", executor.subscribe(id, Number.MAX_SAFE_INTEGER, () => { throw new Error("should not fire"); }) !== undefined);

  // Exit path.
  executor.write(id, "exit\r");
  const exited = await waitFor(() => events.some((e) => e.kind === "exit"), 5000);
  check("emits an exit event when the process ends", exited);
  check("handle status becomes 'exited'", executor.get(id)?.status === "exited");

  await executor.terminate(id);

  console.log(failures === 0 ? "\nALL EXECUTOR TESTS PASSED" : `\n${failures} EXECUTOR TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
