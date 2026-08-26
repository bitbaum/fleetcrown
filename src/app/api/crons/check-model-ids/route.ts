// Cron target — model-rot detector.
//
// On 2026-08-18 Groq removed `llama-3.3-70b-versatile`. FleetCrown kept asking
// for it for EIGHT DAYS: the frontier digest, the proposal generator, activity
// digests, calendar extraction and voice-adjacent paths all 404'd, and nothing
// said so. `npm run check:models` already answered the question — but it was a
// command a human had to remember to type, which is not automation. This is
// the clock typing it.
//
// Deliberately ZERO tokens: one GET /models per provider, no inference. The
// Groq free tier is 100k tokens/DAY org-wide across every feature, so a
// monitor that spent tokens would compete with the product for the very
// resource it exists to protect — and could itself cause the exhaustion it
// is meant to detect.
//
// Three outcomes, never collapsed into two:
//   ROT       — a pin is absent from a catalogue we READ. Alert, loudly.
//   UNCHECKED — we could not read the catalogue. Logged as a warning, never
//               alerted-as-rot and never counted as a pass.
//   OK        — every pin present. Logged, so the checker's own silence is
//               distinguishable from "nothing was ever checked".
//
// Schedule: daily 06:30 UTC (scripts/install-hetzner-crons.sh) — ahead of the
// 08:00 frontier digest, so a dead pin is known before the day's AI work runs.

import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { logDebug } from "@/db/queries/debug-logs";
import { refreshOrInsertActiveAlert } from "@/db/queries/alerts";
import { getDefaultUser } from "@/db/queries/users";
import { sendTelegramMessage, selfTelegramTarget } from "@/lib/actions/telegram-send";
import { checkRegisteredModels, describeRot } from "@/lib/model-check";

const ALERT_TYPE = "model_rot";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const report = await checkRegisteredModels();
  const rotted = report.missing.length;
  const unchecked = report.uncheckedIds.length;

  let alerted = false;
  if (rotted > 0) {
    const owner = await getDefaultUser();
    if (owner) {
      const detail = describeRot(report);
      const { created } = await refreshOrInsertActiveAlert({
        userId: owner.id,
        type: ALERT_TYPE,
        severity: "urgent",
        title: `${rotted} pinned AI model${rotted === 1 ? "" : "s"} no longer exist${rotted === 1 ? "s" : ""}`,
        description:
          `The provider has removed ${rotted === 1 ? "a model id" : "model ids"} FleetCrown still calls. ` +
          `Every feature below is failing now, silently:\n${detail}\n\n` +
          `Fix: pick a live id, update the constant it comes from, and re-run \`npm run check:models\`.`,
        actionUrl: "/system",
        metadata: {
          missing: report.missing.map((m) => ({ id: m.id, provider: m.provider, usedFor: m.usedFor })),
          uncheckedIds: report.uncheckedIds,
        },
      });
      alerted = true;
      // Fire the out-of-band ping once per episode, not on every daily tick.
      if (created) {
        const tg = selfTelegramTarget();
        if (tg) {
          void sendTelegramMessage(
            tg,
            `🚨 FleetCrown: ${rotted} pinned AI model id(s) GONE from the provider.\n${detail}\n\n` +
              `These features are dark until the pin is updated.`,
          );
        }
      }
    }
  }

  // Heartbeat + audit on every outcome. A checker that only speaks when it
  // finds something cannot be distinguished from a checker that never ran.
  await logDebug({
    source: "crons/check-model-ids",
    level: rotted > 0 ? "error" : unchecked > 0 ? "warn" : "info",
    message:
      rotted > 0
        ? `MODEL ROT: ${rotted} pinned id(s) gone — ${report.missing.map((m) => m.id).join(", ")}`
        : unchecked > 0
          ? `${report.presentCount} pinned id(s) present; ${unchecked} UNCHECKED (catalogue unreadable) — not a pass for those`
          : `All ${report.presentCount} pinned model id(s) exist at their provider`,
    meta: {
      rotted,
      unchecked,
      present: report.presentCount,
      providers: report.providers.map((p) => ({ provider: p.provider, reachable: p.reachable })),
    },
  });

  return NextResponse.json({
    ok: rotted === 0,
    rotted,
    unchecked,
    present: report.presentCount,
    alerted,
    missing: report.missing.map((m) => ({ id: m.id, provider: m.provider })),
    uncheckedIds: report.uncheckedIds,
  });
}
