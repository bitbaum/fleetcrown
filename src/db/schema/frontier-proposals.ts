import { pgTable, uuid, date, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";

/** A self-improvement proposal the fleet drafted from a day's frontier digest.
 *
 *  The loop auto-PROPOSES; a human accepts (→ creates a roadmap goal) or
 *  dismisses. Decision history grounds future runs so nothing is re-proposed.
 *  `score` is the adversarial self-critique score (0–100); only proposals that
 *  clear the bar are stored. */
export const frontierProposals = pgTable("frontier_proposals", {
  id:            uuid("id").primaryKey().defaultRandom(),
  digestDate:    date("digest_date").notNull(),
  userId:        uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityId:      uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
  title:         text("title").notNull(),
  rationale:     text("rationale").notNull(),
  /** URLs of the digest items that inspired this proposal (real links). */
  sourceUrls:    jsonb("source_urls").$type<string[]>().notNull(),
  /** Consensus score = the lowest score across the judge panel (conservative). */
  score:         integer("score").notNull(),
  /** Per-judge breakdown from the cross-model panel: which models scored it what. */
  verifierScores: jsonb("verifier_scores").$type<{ model: string; score: number }[]>(),
  /** "proposed" | "accepted" | "dismissed" */
  status:        text("status").notNull().default("proposed"),
  /** Set when accepted — the goal this proposal became. */
  createdGoalId: uuid("created_goal_id"),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt:     timestamp("decided_at", { withTimezone: true }),
}, (table) => [
  index("idx_frontier_proposals_user_status").on(table.userId, table.status),
]);

export type FrontierProposalRow    = typeof frontierProposals.$inferSelect;
export type NewFrontierProposalRow = typeof frontierProposals.$inferInsert;
