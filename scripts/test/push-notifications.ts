/**
 * Inline self-tests for Web Push (Stage 5) — keeps the subscribe/notify
 * surface, service worker, and Stop-hook bridge wired together.
 * Run: npm run test:push-notifications
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
    assert(existsSync("drizzle/0020_push_subscriptions.sql"), "0020_push_subscriptions.sql must exist");
  });

  check("API routes exist (subscribe + notify)", () => {
    assert(existsSync("src/app/api/push/subscribe/route.ts"), "subscribe route must exist");
    assert(existsSync("src/app/api/push/notify/route.ts"), "notify route must exist");
    const notify = readFileSync("src/app/api/push/notify/route.ts", "utf8");
    assert(/getApiUserId/.test(notify), "notify must accept daemon bearer auth");
    assert(/focus=/.test(notify), "notify payload must deep-link to /control?focus=");
  });

  check("service worker handles push + notificationclick", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    assert(/addEventListener\("push"/.test(sw), "sw.js must listen for push");
    assert(/addEventListener\("notificationclick"/.test(sw), "sw.js must handle notificationclick");
    assert(/showNotification/.test(sw), "sw.js must show OS notifications");
  });

  check("Stop hook calls push_notify_stop", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    assert(/push_notify_stop/.test(sh), "push_notify_stop helper must exist");
    assert(/\/api\/push\/notify/.test(sh), "push_notify_stop must POST /api/push/notify");
    const stopCalls = sh.match(/push_notify_stop\s+"\$TAB_NAME"/g) ?? [];
    assert(stopCalls.length >= 1, "handle_stop must invoke push_notify_stop");
  });

  check("NotificationsPill is wired into AppTopBar", () => {
    const bar = readFileSync("src/components/shell/AppTopBar.tsx", "utf8");
    assert(/NotificationsPill/.test(bar), "AppTopBar must render NotificationsPill");
  });

  check("configureWebPush requires VAPID env vars", () => {
    const lib = readFileSync("src/lib/push.ts", "utf8");
    assert(/VAPID_PUBLIC_KEY/.test(lib), "push.ts must read VAPID_PUBLIC_KEY");
    assert(/VAPID_PRIVATE_KEY/.test(lib), "push.ts must read VAPID_PRIVATE_KEY");
    assert(/VAPID_SUBJECT/.test(lib), "push.ts must read VAPID_SUBJECT");
    assert(/503/.test(readFileSync("src/app/api/push/notify/route.ts", "utf8")),
      "notify route must return 503 when push is not configured");
  });

  console.log(`\n${passed}/${passed} passed`);
}

runTests();
