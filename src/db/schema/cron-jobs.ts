import { pgTable, uuid, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { CronJob } from "@/lib/crons-shared";

/** Per-user scheduled agent jobs (replaces host-local ~/.openclaw/cron/jobs.json). */
export const cronJobs = pgTable(
  "cron_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Full openclaw-compatible job document. */
    job: jsonb("job").$type<CronJob>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_cron_jobs_user_id").on(table.userId),
    index("idx_cron_jobs_user_enabled").on(table.userId, table.enabled),
  ],
);

export type CronJobRow = typeof cronJobs.$inferSelect;
export type NewCronJobRow = typeof cronJobs.$inferInsert;
