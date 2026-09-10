// Cron target — OrangeCat promote backfill (bridge Part C reconcile step).
//
// promoteDevLogEntry / promoteMomentToOrangeCat are fire-and-forget at the
// user-action call sites: a process restart, OC downtime, or an expired token
// drops the promote silently. The bridge spec's rule is "best-effort must not
// mean silently lossy" — this janitor re-emits recent publish-worthy moments
// for projects that opted into Publish (orangecatProjectId). Linking alone is
// not consent, and history from before publish is skipped. External ids are
// deterministic (sha256 of the entry / stable project id), so re-posting is
// idempotent: OrangeCat reconciles on (source, external_id) and returns 200
// instead of double-posting.
//
// Schedule: daily at 09:00 UTC (systemd timer, scripts/install-hetzner-crons.sh).

import { type NextRequest, NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { userProjects } from "@/db/schema";
import type { DevLogEntry } from "@/db/schema/user-projects";
import { requireCronAuth } from "@/lib/cron-auth";
import { DAY_MS } from "@/lib/constants/time";
import { logDebug } from "@/db/queries/debug-logs";
import {
  promoteDevLogEntry,
  promoteMomentToOrangeCat,
  promoteRunClose,
  type PromoteOutcome,
} from "@/lib/integrations/orangecat-publish";
import { getRecentSuccessfulRuns } from "@/db/queries/orchestration-runs";
import { getOrangeCatLinksForProject } from "@/db/queries/orangecat-links";

/** Upper bound on how far back we look — never past publish consent (below). */
const BACKFILL_WINDOW_DAYS = 14;
/** Cap re-emits per tick so a misconfig can't hammer the OC publish bus. */
const MAX_PROMOTES_PER_TICK = 50;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const linked = await db
    .select({
      id: userProjects.id,
      userId: userProjects.userId,
      name: userProjects.name,
      description: userProjects.description,
      devLog: userProjects.devLog,
      orangecatProjectId: userProjects.orangecatProjectId,
    })
    .from(userProjects)
    .where(and(isNotNull(userProjects.orangecatProjectId), eq(userProjects.isActive, true)));

  const counts: Record<PromoteOutcome, number> = { posted: 0, skipped: 0, failed: 0 };
  let attempted = 0;
  let capped = false;

  outer: for (const project of linked) {
    // Linking an OrangeCat account is not consent to publish. Publish sets the
    // funding entity link; its createdAt is when the operator opted the project
    // onto the public wall. Never backfill private history from before that.
    const links = await getOrangeCatLinksForProject(project.userId, project.id);
    const publishLink =
      links.find((l) => l.entityId === project.orangecatProjectId) ??
      links.find((l) => l.role === "funding");
    const publishedAt = publishLink?.createdAt ?? null;
    // No publish timestamp → only reconcile the "went public" moment; do not
    // invent a 14-day dump of private notes onto the wall.
    const historyCutoffIso = publishedAt
      ? new Date(
          Math.max(publishedAt.getTime(), Date.now() - BACKFILL_WINDOW_DAYS * DAY_MS),
        ).toISOString()
      : null;
    const historyCutoffDate = historyCutoffIso ? historyCutoffIso.slice(0, 10) : null;

    // The "went public" moment first — it anchors the wall if the original
    // fire-and-forget emit was dropped during the publish call.
    const moments: Array<() => Promise<PromoteOutcome>> = [
      () =>
        promoteMomentToOrangeCat(project.userId, project.id, "project_published", {
          externalId: `fleetcrown_project_published_${project.id}`,
          title: `${project.name} is now building in public`,
          description: project.description ?? undefined,
          subjectId: project.orangecatProjectId ?? undefined,
        }),
      ...((project.devLog ?? []) as DevLogEntry[])
        .filter((entry) => historyCutoffDate != null && entry.date >= historyCutoffDate)
        .map((entry) => () => promoteDevLogEntry(project.userId, project.id, project.name, entry)),
      // Run→wall reconcile: only runs finished at/after publish consent.
      ...(historyCutoffIso
        ? (
            await getRecentSuccessfulRuns(project.userId, project.name, new Date(historyCutoffIso))
          ).map((run) => () => promoteRunClose(run))
        : []),
    ];

    // Sequential on purpose: this is a janitor, not a hot path — one in-flight
    // request to the OC bus at a time.
    for (const emit of moments) {
      if (attempted >= MAX_PROMOTES_PER_TICK) {
        capped = true;
        break outer;
      }
      attempted++;
      counts[await emit()]++;
    }
  }

  const summary = { projects: linked.length, attempted, ...counts, capped };
  await logDebug({
    source: "crons/orangecat-promote-backfill",
    level: counts.failed > 0 ? "warn" : "info",
    message: "backfill tick",
    meta: summary,
  });
  return NextResponse.json({ ok: true, ...summary });
}
