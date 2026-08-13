/**
 * Inline tests for the chat close-notification decision
 * (lib/orchestration/notify-close.ts, pure half). The contract under test:
 * ONLY runs that opted in via payload.notifyOnClose ever produce a message —
 * a formatting regression here either spams the phone with the fleet's whole
 * churn or silently swallows chat-dispatch outcomes.
 *
 * Run: npm run test:notify-close
 */
import { formatRunCloseMessage } from "@/lib/orchestration/notify-close-format";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  const base = {
    projectKey: "orangecat",
    outcome: "success",
    finishedAt: new Date("2026-08-13T12:00:00Z"),
    payload: { projectKey: "orangecat", projectPath: "/x", notifyOnClose: true },
  } as Parameters<typeof formatRunCloseMessage>[0];

  check("no opt-in ⇒ null (UI dispatches stay silent)", () => {
    assert(
      formatRunCloseMessage({ ...base, payload: { projectKey: "orangecat", projectPath: "/x" } }) === null,
      "expected null without notifyOnClose",
    );
  });

  check("opted-in but not finished ⇒ null", () => {
    assert(formatRunCloseMessage({ ...base, finishedAt: null }) === null, "expected null for open run");
  });

  check("success carries ✅ + project + outcome", () => {
    const msg = formatRunCloseMessage(base);
    assert(!!msg && msg.startsWith("✅ orangecat: run success"), `got: ${msg}`);
  });

  check("failure carries ❌ and the error text", () => {
    const msg = formatRunCloseMessage({
      ...base,
      outcome: "error",
      payload: { ...base.payload!, error: "runner nack" },
    });
    assert(!!msg && msg.startsWith("❌") && msg.includes("runner nack"), `got: ${msg}`);
  });

  check("partial carries 🟡", () => {
    const msg = formatRunCloseMessage({ ...base, outcome: "partial" });
    assert(!!msg && msg.startsWith("🟡"), `got: ${msg}`);
  });

  check("resultText wins over error and is truncated to 600 chars", () => {
    const msg = formatRunCloseMessage({
      ...base,
      payload: { ...base.payload!, resultText: "R".repeat(1000), error: "ignored" },
    });
    const body = msg?.split("\n")[1] ?? "";
    assert(body.length === 600 && !msg?.includes("ignored"), `body len ${body.length}`);
  });

  console.log(`\n${passed} passed`);
}

runTests();
