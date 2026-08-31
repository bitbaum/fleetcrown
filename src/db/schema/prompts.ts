import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";
import { orgs } from "./orgs";

// User-owned prompt library — v2.1.
//
// Pre-v2.1 the prompt library was 41 templates baked into src/config/prompt-
// library.ts. Users couldn't add their own. This table is the structural
// fix: each row is a prompt OWNED by a user (or org-shared). FleetCrown's
// 41 defaults stay in code as the seed catalog; the /prompts page merges
// them with rows from this table at read time, so users see both their
// own and the defaults in one library view.
//
// Three scopes:
//   - "global"  → the user's personal prompt, available across every project
//   - "project" → pinned to a specific project (project_id required)
//   - "org"     → shared across the user's org (org_id required)
//
// Variables: bodies use {{name}} or {{name|default}} placeholders. The
// declared variables array is the SSOT for what placeholders exist, so the
// run-time UI can render an input per variable without re-parsing the body.
//
// Sources: "user" = manually created, "captured" = saved from a successful
// ad-hoc dispatch via /history, "fc-default-fork" = forked from a FleetCrown
// default and customized. The original FC defaults are NOT inserted here.
export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Display name. Required + max 120 chars — same shape as the FC defaults
     *  for consistent rendering. */
    name: text("name").notNull(),
    /** One-line description shown in the card subtitle. */
    description: text("description"),
    /** The prompt body. Supports {{name}} and {{name|default}} placeholders
     *  that the run-time UI prompts the user to fill. Up to 20KB to match the
     *  FC-default template size. */
    body: text("body").notNull(),
    /** "global" | "project" | "org" — see file header. */
    scope: text("scope").notNull().default("global"),
    /** Required when scope='project'. Null otherwise. */
    projectId: uuid("project_id").references(() => entities.id, { onDelete: "cascade" }),
    /** Required when scope='org'. Null otherwise. */
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
    /** Free-text tags for filtering. Drizzle text[] not used — JSONB is the
     *  existing pattern for flexible array-ish fields elsewhere in the schema. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** Declared variables in {{name}} placeholders, in order. The UI renders
     *  one input per entry. Defaults come from the {{name|default}} syntax. */
    variables: jsonb("variables")
      .$type<Array<{ name: string; defaultValue?: string; description?: string }>>()
      .notNull()
      .default([]),
    /** Provenance — see file header. */
    source: text("source").notNull().default("user"),
    /** "fc-default-fork" rows carry the original FC default id so the UI can
     *  show "Forked from: <original name>". Null for user-created prompts. */
    forkedFromKey: text("forked_from_key"),
    /** Success/failure tallies tracked from orchestration_runs.outcome.
     *  Surfaced in the UI as a small "94% success (47 runs)" chip. Updated
     *  lazily on each run completion. */
    runCount: integer("run_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    /** False = soft-deleted; preserves run history if any. */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_prompts_user_id").on(table.userId),
    index("idx_prompts_project_id").on(table.projectId),
    index("idx_prompts_scope").on(table.scope),
    index("idx_prompts_active").on(table.userId, table.isActive),
  ],
);

export type PromptRow = typeof prompts.$inferSelect;
export type NewPromptRow = typeof prompts.$inferInsert;
