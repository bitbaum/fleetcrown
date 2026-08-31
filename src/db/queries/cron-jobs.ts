import { db } from "@/db";
import { cronJobs } from "@/db/schema/cron-jobs";
import { eq, and, desc, sql } from "drizzle-orm";
import type { CronJob } from "@/lib/crons-shared";

export async function listCronJobsForUser(userId: string): Promise<CronJob[]> {
  const rows = await db
    .select({ job: cronJobs.job })
    .from(cronJobs)
    .where(eq(cronJobs.userId, userId))
    .orderBy(desc(cronJobs.updatedAt));
  return rows.map((r) => r.job);
}

export async function getCronJobRowByOpenclawId(userId: string, openclawId: string) {
  const [row] = await db
    .select()
    .from(cronJobs)
    .where(and(eq(cronJobs.userId, userId), sql`${cronJobs.job}->>'id' = ${openclawId}`))
    .limit(1);
  return row ?? null;
}

export async function insertCronJob(userId: string, job: CronJob): Promise<CronJob> {
  const [row] = await db
    .insert(cronJobs)
    .values({
      userId,
      job,
      enabled: job.enabled,
    })
    .returning({ job: cronJobs.job });
  return row.job;
}

export async function updateCronJobForUser(
  userId: string,
  openclawId: string,
  patch: Partial<CronJob>,
): Promise<CronJob | null> {
  const existing = await getCronJobRowByOpenclawId(userId, openclawId);
  if (!existing) return null;

  const merged: CronJob = {
    ...existing.job,
    ...patch,
    id: existing.job.id,
    state: { ...existing.job.state, ...(patch.state ?? {}) },
    payload: { ...existing.job.payload, ...(patch.payload ?? {}) },
    schedule: { ...existing.job.schedule, ...(patch.schedule ?? {}) },
    delivery: { ...existing.job.delivery, ...(patch.delivery ?? {}) },
    updatedAtMs: Date.now(),
  };

  await db
    .update(cronJobs)
    .set({
      job: merged,
      enabled: merged.enabled,
      updatedAt: new Date(),
    })
    .where(eq(cronJobs.id, existing.id));

  return merged;
}
