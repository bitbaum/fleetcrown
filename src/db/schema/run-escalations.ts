import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { isNull } from "drizzle-orm";
import { users } from "./users";
import type { EscalationLevel } from "@/lib/orchestration/escalation-ladder";

/**
 * run_escalations — the structured escalation ladder as data.
 *
 * One OPEN row (resolvedAt null) per (user, project) at a time — now enforced
 * by a partial unique index rather than merely intended. advanceEscalation
 * read-then-inserts, and the reaper fires it for every reaped run WITHOUT
 * awaiting, so concurrent closes for one project both saw "no open row" and
 * both inserted. Measured 2026-08-26: orangecat held three open rows and
 * datacat two, which splits one project's streak across several ladders so the
 * rung stops matching the real failure count.
 *
 * Each failing close advances a rung (retry → patch → replan → human, see
 * lib/orchestration/escalation-ladder.ts); any close where work landed
 * resolves it.
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
  /** How it closed: 'success' (goal met), 'progress' (real work landed, bar
   *  not cleared), 'manual' (operator dismissed the alert), or 'superseded'
   *  (a race duplicate collapsed by migration 0057 — never written at
   *  runtime, and excludable when measuring escalation rate per rung). */
  resolvedBy: text("resolved_by").$type<"success" | "progress" | "manual" | "superseded">(),
}, (t) => [
  // The hot lookup: the open ladder for one project (dispatch prompt assembly).
  index("idx_run_escalations_open").on(t.userId, t.projectKey, t.resolvedAt),
  index("idx_run_escalations_opened_at").on(t.openedAt),
  // The invariant the ladder always assumed. Partial, so resolved history is
  // unconstrained — the escalation RATE per rung is the whole point of keeping
  // old rows, and only the OPEN one has to be singular.
  uniqueIndex("uq_run_escalations_one_open_per_project")
    .on(t.userId, t.projectKey)
    .where(isNull(t.resolvedAt)),
]);

export type RunEscalation = typeof runEscalations.$inferSelect;
export type NewRunEscalation = typeof runEscalations.$inferInsert;
