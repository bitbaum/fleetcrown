import { desc } from "drizzle-orm";
import { db } from "@/db";
import { frontierDigests, type FrontierDigestRow, type NewFrontierDigestRow } from "@/db/schema";

/** Insert today's digest, or overwrite it if the cron already ran today
 *  (digestDate is unique → one row per day, idempotent). */
export async function upsertFrontierDigest(row: NewFrontierDigestRow): Promise<FrontierDigestRow> {
  const [saved] = await db
    .insert(frontierDigests)
    .values(row)
    .onConflictDoUpdate({
      target: frontierDigests.digestDate,
      set: {
        headline: row.headline,
        intro: row.intro,
        items: row.items,
        candidateCount: row.candidateCount,
        sourceCount: row.sourceCount,
        model: row.model,
        generatedAt: new Date(),
      },
    })
    .returning();
  return saved;
}

/** The most recent published digest (what /frontier renders), or null. */
export async function getLatestFrontierDigest(): Promise<FrontierDigestRow | null> {
  const [row] = await db
    .select()
    .from(frontierDigests)
    .orderBy(desc(frontierDigests.digestDate))
    .limit(1);
  return row ?? null;
}

/** Recent digests for an archive strip (date + headline only is enough, but we
 *  return full rows for simplicity; the list is short). */
export async function listRecentFrontierDigests(limit = 14): Promise<FrontierDigestRow[]> {
  return db
    .select()
    .from(frontierDigests)
    .orderBy(desc(frontierDigests.digestDate))
    .limit(limit);
}
