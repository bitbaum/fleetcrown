import { selfTelegramTarget, sendTelegramMessage } from "@/lib/actions/telegram-send";
import { logDebug } from "@/db/queries/debug-logs";
import { formatRunCloseMessage, formatRunClosePush } from "@/lib/orchestration/notify-close-format";
import { listSubscriptionsForUser, pruneDeadEndpoints } from "@/db/queries/push-subscriptions";
import { configureWebPush, sendOne, isDeadStatus } from "@/lib/push";
import { PUSH_TAG_PREFIX } from "@/config/brand-storage";
import { fleetSurfaceHref } from "@/lib/fleet-context";
import type { OrchestrationRun } from "@/db/schema/orchestration-runs";

/**
 * Close notification for captain-initiated runs (Control, Loki, Implement,
 * Install, palette). Opt-in via payload.notifyOnClose. Autopilot / idle-nudge
 * stays silent so fleet churn never spams the phone.
 *
 * Delivers Telegram (if configured) and web push (if the captain subscribed).
 * Fire-and-forget: called as `void notifyRunClosed(...)` from close choke
 * points; must never throw or slow a close. Message logic lives in
 * notify-close-format.ts (pure, unit-tested).
 */
export async function notifyRunClosed(run: OrchestrationRun): Promise<void> {
  try {
    const message = formatRunCloseMessage(run);
    const push = formatRunClosePush(run);
    if (!message && !push) return;

    if (message) {
      try {
        const target = selfTelegramTarget();
        if (target) await sendTelegramMessage(target, message);
      } catch (e) {
        void logDebug({
          source: "orchestration/notify-close",
          level: "warn",
          message: `run-close telegram failed for ${run.id}: ${(e as Error).message}`,
        });
      }
    }

    if (!push) return;
    const cfg = configureWebPush();
    if (!cfg.ok) return;
    const subs = await listSubscriptionsForUser(run.userId);
    if (subs.length === 0) return;
    const payload = {
      title: push.title,
      body: push.body,
      url: fleetSurfaceHref("control", run.projectKey),
      tag: `${PUSH_TAG_PREFIX}run:${run.projectKey}`,
    };
    const results = await Promise.all(subs.map((s) => sendOne(s, payload)));
    const dead = results.filter((r) => !r.ok && isDeadStatus(r.statusCode)).map((r) => r.endpoint);
    if (dead.length > 0) await pruneDeadEndpoints(dead);
  } catch (e) {
    void logDebug({
      source: "orchestration/notify-close",
      level: "warn",
      message: `run-close notify failed for ${run.id}: ${(e as Error).message}`,
    });
  }
}
