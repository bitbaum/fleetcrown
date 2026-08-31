import { pgTable, uuid, text, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { entities } from "./entities";
import { HUMAN_TASK_STATUS, type HumanTaskStatus } from "@/lib/constants/statuses";
import type { TaskActor, TaskEventKind } from "@/config/crew";

/**
 * Assignments handed to humans — the half of the fleet an agent cannot run.
 *
 * `assigneeId` and `projectId` both point at `entities` (a person and a project
 * row respectively), which is what makes an assignment a first-class citizen of
 * the same graph as everything else: the person is the one already in the
 * operator's book, the project is the one on /projects. Both are nullable and
 * both `set null` on delete — losing a contact must not take the record of the
 * work with it, and an unassigned draft is a perfectly good ask still looking
 * for someone to do it.
 *
 * The share token is the whole delivery mechanism. An assignee never signs in;
 * they open a link and answer. So the token is the credential, and it is minted
 * ONLY when the operator hands the task over. Revoking sets `revokedAt`, which
 * takes the link dead without destroying the record of what was sent.
 *
 * Fee columns state the terms; they never move money. `orangecatServiceId` is
 * the pointer to where settlement actually happens — see
 * lib/integrations/orangecat-human-task.ts.
 */
export const humanTasks = pgTable(
  "human_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id").references(() => entities.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => entities.id, { onDelete: "set null" }),

    title: text("title").notNull(),
    /** What to actually do. Written for the human, not for you. */
    brief: text("brief"),
    /** Why it matters — the half that turns an order into a reason to say yes. */
    reason: text("reason"),

    status: text("status").$type<HumanTaskStatus>().notNull().default(HUMAN_TASK_STATUS.DRAFT),

    dueDate: timestamp("due_date", { withTimezone: true }),
    /**
     * NUMERIC(20,8), not `real`, because a fee can be denominated in BTC and one
     * satoshi is 0.00000001. float4 carries ~7 significant digits, so it cannot
     * represent a satoshi at all — 0.00050001 BTC would silently round, and the
     * amount a human is owed is the last field in this system allowed to drift.
     * Eight decimals is exactly Bitcoin's precision; fiat fees use two of them.
     */
    feeAmount: numeric("fee_amount", { precision: 20, scale: 8, mode: "number" }),
    feeCurrency: text("fee_currency"),

    /** Mirror of this assignment on OrangeCat, where it can be paid. */
    orangecatServiceId: text("orangecat_service_id"),
    orangecatUrl: text("orangecat_url"),

    /** Handover link. Null until the operator sends it; dead once revoked. */
    shareToken: text("share_token"),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Set the first time the assignee actually opens the link. */
    viewedAt: timestamp("viewed_at", { withTimezone: true }),

    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_human_tasks_user_id").on(t.userId),
    index("idx_human_tasks_user_status").on(t.userId, t.status),
    index("idx_human_tasks_assignee").on(t.assigneeId),
    index("idx_human_tasks_project").on(t.projectId),
    index("idx_human_tasks_due_date").on(t.dueDate),
    // Partial, not a plain unique: revoked tokens stay on the row as history, and
    // several of those are legitimately NULL-adjacent duplicates of nothing. Only
    // LIVE tokens have to be unique, because only they resolve to a task.
    uniqueIndex("uq_human_tasks_live_share_token")
      .on(t.shareToken)
      .where(sql`share_token IS NOT NULL AND revoked_at IS NULL`),
  ],
);

/**
 * The assignment's timeline — every hand-off, answer, and note, in order.
 *
 * This is not decoration. When a person declines at 23:00 and you read it the
 * next morning, the status alone ("declined") has lost the reason they typed.
 * `actor` records which SIDE moved the row, so the share page can show the
 * assignee their own words back without ever exposing the operator's.
 */
export const humanTaskEvents = pgTable(
  "human_task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => humanTasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<TaskEventKind>().notNull(),
    actor: text("actor").$type<TaskActor>().notNull(),
    /** Status the row moved to, when `kind` is a status change. */
    status: text("status").$type<HumanTaskStatus>(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_human_task_events_task").on(t.taskId, t.createdAt),
    index("idx_human_task_events_user").on(t.userId),
  ],
);

export type HumanTask = typeof humanTasks.$inferSelect;
export type NewHumanTask = typeof humanTasks.$inferInsert;
export type HumanTaskEvent = typeof humanTaskEvents.$inferSelect;
export type NewHumanTaskEvent = typeof humanTaskEvents.$inferInsert;
