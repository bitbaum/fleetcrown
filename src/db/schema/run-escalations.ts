import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { EscalationLevel } from "@/lib/orchestration/escalation-ladder";

/**
 * run_escalations — the structured escalation ladder as data.
 *
 * One OPEN row (resolvedAt null) per (user, project) at a time: each failing
 * run close advances it a rung (retry → patch → replan → human, see
 * lib/orchestration/escalation-ladder.ts); a successful close resolves it.
 * Rows are kept after resolution — the escalation RATE per project and per
 * rung is the observability the ladder exists to create (how often do we
 * recover at rung 1 vs. need a human?).
 */
export const runEscalations = pgTable("run_escalations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectKey: text("project_key").notNull(),
  level: text("level").$type<EscalationLevel>().notNull(),
  failStreak: integer("fail_streak").notNull(),
  /** The failing run that last advanced this ladder. */
  lastRunId: uuid("last_run_id"),
  lastOutcome: text("last_outcome"),
  lastError: text("last_error"),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  /** 'success' (a run succeeded) or 'manual' (operator dismissed). */
  resolvedBy: text("resolved_by").$type<"success" | "manual">(),
}, (t) => [
  // The hot lookup: the open ladder for one project (dispatch prompt assembly).
  index("idx_run_escalations_open").on(t.userId, t.projectKey, t.resolvedAt),
  index("idx_run_escalations_opened_at").on(t.openedAt),
]);

export type RunEscalation = typeof runEscalations.$inferSelect;
export type NewRunEscalation = typeof runEscalations.$inferInsert;
