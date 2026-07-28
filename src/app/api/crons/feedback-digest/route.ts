// Cron target — the feedback digester: cluster each busy project's NEW visitor
// feedback into themes and file each theme as a draft DISPATCH_PROMPT action
// the operator approves on /approvals before anything runs (IRON RULE — raw
// visitor text is untrusted input; the human gate is a security boundary).
//
// Scope mirrors propose-checkins: only users with fleet autopilot ON. Bounded
// per user by min-items, per-project and per-tick caps, and a draft-dedupe
// (see digest-producer.ts) so it can never flood the approval queue.
//
// Schedule: daily (systemd timer, scripts/install-hetzner-crons.sh).
// Idempotent: standing drafts make a second run a no-op per project.

import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { getFleetAutopilotUserIds } from "@/db/queries/beacon-settings";
import { digestFeedback } from "@/lib/feedback/digest-producer";
import { logDebug } from "@/db/queries/debug-logs";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const users = await getFleetAutopilotUserIds();
  let proposedTotal = 0;
  const perUser: Array<{ userId: string; proposed: number; projectsScanned: number; skipped: string | null }> = [];

  for (const userId of users) {
    try {
      const r = await digestFeedback(userId);
      proposedTotal += r.proposed;
      perUser.push({ userId, ...r });
    } catch (e) {
      perUser.push({ userId, proposed: 0, projectsScanned: 0, skipped: `error:${(e as Error).message}` });
    }
  }

  await logDebug({
    source: "crons/feedback-digest",
    level: "info",
    message: `Proposed ${proposedTotal} feedback dispatch(es) across ${users.length} autopilot-on user(s)`,
    meta: { proposedTotal, perUser },
  }).catch(() => {});

  return NextResponse.json({ ok: true, users: users.length, proposed: proposedTotal, perUser });
}
