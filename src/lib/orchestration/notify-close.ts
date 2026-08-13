import { selfTelegramTarget, sendTelegramMessage } from "@/lib/actions/telegram-send";
import { logDebug } from "@/db/queries/debug-logs";
import { formatRunCloseMessage } from "@/lib/orchestration/notify-close-format";
import type { OrchestrationRun } from "@/db/schema/orchestration-runs";

/**
 * Chat-side close notification for runs dispatched from chat.
 *
 * A dispatch made from WhatsApp/Telegram (via Loki's fleet skill) has no
 * Control tab open watching it — without a push, the outcome lands nowhere the
 * operator is looking. Runs opt in via payload.notifyOnClose; UI dispatches
 * stay silent so the fleet's normal churn never spams the phone.
 *
 * Fire-and-forget by contract: called as `void notifyRunClosed(...)` from the
 * close choke points, must never throw or slow a close. The message logic
 * lives in notify-close-format.ts (pure, unit-tested).
 */
export async function notifyRunClosed(run: OrchestrationRun): Promise<void> {
  try {
    const message = formatRunCloseMessage(run);
    if (!message) return;
    const target = selfTelegramTarget();
    if (!target) return;
    await sendTelegramMessage(target, message);
  } catch (e) {
    void logDebug({
      source: "orchestration/notify-close",
      level: "warn",
      message: `run-close notify failed for ${run.id}: ${(e as Error).message}`,
    });
  }
}
