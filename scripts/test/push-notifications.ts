/**
 * Inline self-tests for Web Push (Stage 5) — keeps the subscribe/notify
 * surface, the service worker, and the run-close notification wired together.
 * Run: npm run test:push-notifications
 *
 * Needs no environment: every check is a static file read. It was excluded from
 * test:unit for years as "needs push/web-push env", which was never true — see
 * the note on the run-close check below.
 */
import { readFileSync, existsSync } from "fs";

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

  check("push_subscriptions schema is exported", () => {
    const index = readFileSync("src/db/schema/index.ts", "utf8");
    assert(/push-subscriptions/.test(index), "schema index must export push-subscriptions");
    const schema = readFileSync("src/db/schema/push-subscriptions.ts", "utf8");
    assert(/pushSubscriptions/.test(schema), "pushSubscriptions table must exist");
  });

  check("migration SQL exists", () => {
    assert(
      existsSync("drizzle/0020_push_subscriptions.sql"),
      "0020_push_subscriptions.sql must exist",
    );
  });

  check("API routes exist (subscribe + notify)", () => {
    assert(existsSync("src/app/api/push/subscribe/route.ts"), "subscribe route must exist");
    assert(existsSync("src/app/api/push/notify/route.ts"), "notify route must exist");
    const notify = readFileSync("src/app/api/push/notify/route.ts", "utf8");
    assert(/getApiUserId/.test(notify), "notify must accept runner bearer auth");
    assert(/focus=/.test(notify), "notify payload must deep-link to /control?focus=");
  });

  check("service worker handles push + notificationclick", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    assert(/addEventListener\("push"/.test(sw), "sw.js must listen for push");
    assert(/addEventListener\("notificationclick"/.test(sw), "sw.js must handle notificationclick");
    assert(/showNotification/.test(sw), "sw.js must show OS notifications");
  });

  // "An agent finished, tell the operator" — the point of this whole surface.
  //
  // This used to read scripts/agent-hook-bridge.sh and assert a bash helper
  // called push_notify_stop. That file was deleted on 2026-06-11 (956ccf64,
  // "delete the bash daemon and bridge files") when the Stop hook moved into
  // TypeScript, so the check threw ENOENT and the whole suite exited 1 — while
  // its entry in scripts/test-unit.ts SKIP said it "needs push/web-push env",
  // which was never why it failed. A test excluded from CI for a reason that
  // was not the real one is a test that rots unread: nothing has asserted this
  // path for three months.
  //
  // Retargeted, not deleted. The behaviour did not go away, it moved —
  // notify-close.ts reaches the operator through pushToUser now — and
  // scripts/test/notify-close.ts covers that module without mentioning push at
  // all. Deleting the check would have quietly ratified the coverage hole.
  check("a closing run still pushes to the operator", () => {
    const closer = readFileSync("src/lib/orchestration/notify-close.ts", "utf8");
    assert(
      /from "@\/lib\/push-fanout"/.test(closer),
      "notify-close must reach the operator through push-fanout",
    );
    assert(/pushToUser\s*\(/.test(closer), "notify-close must call pushToUser");
    const fanout = readFileSync("src/lib/push-fanout.ts", "utf8");
    assert(
      /listSubscriptionsForUser\s*\(/.test(fanout),
      "push-fanout must look up the operator's subscribed devices",
    );
    // A fan-out that throws would take its caller down with it, and the caller
    // is a run finishing — the notification is the least important thing on
    // that path. The module's own contract says "must never throw".
    assert(
      /catch\b/.test(fanout),
      "push-fanout must be fire-and-forget, never throwing at callers",
    );
  });

  check("NotificationsPill is wired into AppTopBar", () => {
    const bar = readFileSync("src/components/shell/AppTopBar.tsx", "utf8");
    assert(/NotificationsPill/.test(bar), "AppTopBar must render NotificationsPill");
  });

  check("configureWebPush catches invalid VAPID keys", () => {
    const lib = readFileSync("src/lib/push.ts", "utf8");
    assert(
      /try \{[\s\S]*setVapidDetails/.test(lib),
      "configureWebPush must catch setVapidDetails throws",
    );
    const notify = readFileSync("src/app/api/push/notify/route.ts", "utf8");
    assert(/catch \(err/.test(notify), "notify route must catch unhandled errors");
  });

  console.log(`\n${passed}/${passed} passed`);
}

runTests();
