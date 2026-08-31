import { pgTable, uuid, date, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { FrontierItem } from "@/lib/frontier/types";

/** One published daily frontier digest. `digestDate` is unique so the cron is
 *  idempotent (upsert per day). `items` is the editor-ranked, real-link list. */
export const frontierDigests = pgTable("frontier_digests", {
  id: uuid("id").primaryKey().defaultRandom(),
  digestDate: date("digest_date").notNull().unique(),
  headline: text("headline").notNull(),
  intro: text("intro").notNull(),
  items: jsonb("items").$type<FrontierItem[]>().notNull(),
  candidateCount: integer("candidate_count").notNull(),
  sourceCount: integer("source_count").notNull(),
  model: text("model").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FrontierDigestRow = typeof frontierDigests.$inferSelect;
export type NewFrontierDigestRow = typeof frontierDigests.$inferInsert;
