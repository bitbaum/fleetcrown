import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orchestrationRuns } from "@/db/schema/orchestration-runs";
import { getUserProjects } from "@/db/queries/user-projects";
import { getSelfImprovementTarget } from "@/db/queries/frontier";
import { readAppsConf } from "@/lib/register/apps-conf";
import { buildFleetRegister, canonicalSlug, repoFromGitUrl } from "@/lib/register/build";
import { solonOrgSlugs } from "@/lib/register/solon";
import { ORCH_STATE } from "@/lib/orchestration/contract";
import {
  buildFleetMap,
  type FleetMap,
  type MapActivity,
  type MapProfile,
} from "@/lib/register/map";

/**
 * The I/O half of the fleet map: the register join for the studio owner, the
 * profile columns only Loki holds (stack, dev log), and per-project activity
 * (open runs, last finished run). Shared by the API route and the nightly
 * knowledge reindex so the page and the assistant read the same map.
 */
export async function loadFleetMap(): Promise<FleetMap | null> {
  const owner = await getSelfImprovementTarget();
  if (!owner) return null;
  const [projects, solon] = await Promise.all([getUserProjects(owner.userId), solonOrgSlugs()]);
  const rows = buildFleetRegister(
    projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      hostedApp: p.hostedApp,
      gitUrl: p.gitUrl,
      liveUrl: p.liveUrl,
      orangecatProjectId: p.orangecatProjectId,
      solonOrgSlug: p.solonOrgSlug,
      isActive: p.isActive,
    })),
    readAppsConf(),
    solon.orgs,
  );

  const profiles = new Map<string, MapProfile>();
  const keyToSlug = new Map<string, string>();
  for (const p of projects) {
    const slug = canonicalSlug(p.slug || repoFromGitUrl(p.gitUrl) || p.name);
    profiles.set(slug, { stack: p.stack, devLog: p.devLog });
    keyToSlug.set(p.name, slug);
    keyToSlug.set(slug, slug);
  }

  const keys = [...keyToSlug.keys()];
  const activity = new Map<string, MapActivity>();
  if (keys.length) {
    const [open, finished] = await Promise.all([
      db
        .select({ projectKey: orchestrationRuns.projectKey })
        .from(orchestrationRuns)
        .where(
          and(
            eq(orchestrationRuns.userId, owner.userId),
            inArray(orchestrationRuns.projectKey, keys),
            inArray(orchestrationRuns.state, [ORCH_STATE.WAITING, ORCH_STATE.RUNNING]),
            isNull(orchestrationRuns.finishedAt),
          ),
        ),
      db
        .selectDistinctOn([orchestrationRuns.projectKey], {
          projectKey: orchestrationRuns.projectKey,
          outcome: orchestrationRuns.outcome,
          finishedAt: orchestrationRuns.finishedAt,
        })
        .from(orchestrationRuns)
        .where(
          and(
            eq(orchestrationRuns.userId, owner.userId),
            inArray(orchestrationRuns.projectKey, keys),
            isNotNull(orchestrationRuns.outcome),
            isNotNull(orchestrationRuns.finishedAt),
          ),
        )
        .orderBy(orchestrationRuns.projectKey, desc(orchestrationRuns.finishedAt)),
    ]);
    for (const r of open) {
      const slug = keyToSlug.get(r.projectKey);
      if (!slug) continue;
      const a = activity.get(slug) ?? { openRuns: 0, lastRun: null };
      a.openRuns += 1;
      activity.set(slug, a);
    }
    for (const r of finished) {
      const slug = keyToSlug.get(r.projectKey);
      if (!slug || !r.outcome || !r.finishedAt) continue;
      const a = activity.get(slug) ?? { openRuns: 0, lastRun: null };
      if (!a.lastRun || a.lastRun.at < r.finishedAt)
        a.lastRun = { outcome: r.outcome, at: r.finishedAt };
      activity.set(slug, a);
    }
  }

  return buildFleetMap(rows, profiles, activity);
}
