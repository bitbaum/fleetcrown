import { pgTable, uuid, text, timestamp, jsonb, index, bigint, doublePrecision } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { entities } from "./entities";
import { orgs } from "./orgs";
import type { AdapterId, OrchestrationState, OrchestrationTaskIntentId, OrchestrationTaskSummary } from "@/lib/orchestration";

export type OrchestrationRunPayload = {
  projectId?: string | null;
  projectKey: string;
  projectPath: string;
  model?: string;
  resultText?: string;
  raw?: string;
  durationMs?: number;
  error?: string;
  /** Derived tab alias ("<project>~<runId8>") for same-project PARALLEL runs
   *  (phase 2 of worktree-per-agent). The run's session handoff lives under
   *  this tab; close matching keys on it (closeOpenRunBySessionTab). Absent
   *  for ordinary runs. */
  sessionTab?: string;
  /** ISO time the runner ack'd the prompt as actually typed into the session
   *  (stampRunDelivered). The close paths use it as the handoff-freshness
   *  floor so a handoff from before delivery can never close this run. */
  deliveredAt?: string;
  /** Repo-side work evidence attached when the reaper corrects a timeout
   *  verdict (reap-evidence.ts). */
  evidence?: { kind: string; url: string; title: string; atMs: number };
  /** Announce this run's outcome when it closes, on every configured channel
   *  (web push to the installed PWA, plus Telegram when a chat id is set).
   *
   *  Set for dispatches a PERSON initiated — resolved from the auth path, so a
   *  cookie session opts in and a runner/automation Bearer token does not.
   *  That keeps autopilot churn silent (the original reason UI dispatches were
   *  excluded) without assuming the operator is still watching Control: they
   *  usually dispatched and walked away, which is the entire point of having an
   *  always-on builder. */
  notifyOnClose?: boolean;
};

/** Canonical run outcome values — SSOT for the column type, the finish-route
 *  validator (ORCHESTRATION_OUTCOMES tuple), and outcome inference. */
export const ORCHESTRATION_OUTCOME = {
  SUCCESS: "success",
  PARTIAL: "partial",
  ERROR: "error",
  HANG: "hang",
  USER_ABORT: "user_abort",
  TIMEOUT: "timeout",
} as const;
export const ORCHESTRATION_OUTCOMES = [
  ORCHESTRATION_OUTCOME.SUCCESS,
  ORCHESTRATION_OUTCOME.PARTIAL,
  ORCHESTRATION_OUTCOME.ERROR,
  ORCHESTRATION_OUTCOME.HANG,
  ORCHESTRATION_OUTCOME.USER_ABORT,
  ORCHESTRATION_OUTCOME.TIMEOUT,
] as const;
export type OrchestrationOutcome = (typeof ORCHESTRATION_OUTCOMES)[number];

export const orchestrationRuns = pgTable("orchestration_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => entities.id, { onDelete: "set null" }),
  adapter: text("adapter").$type<AdapterId>().notNull(),
  intent: text("intent").$type<OrchestrationTaskIntentId>().notNull(),
  state: text("state").$type<OrchestrationState>().notNull(),
  outcome: text("outcome").$type<OrchestrationOutcome>(),
  projectKey: text("project_key").notNull(),
  projectPath: text("project_path").notNull(),
  summary: jsonb("summary").$type<OrchestrationTaskSummary>(),
  payload: jsonb("payload").$type<OrchestrationRunPayload>(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Token/cost accounting — reported by the runner from the agent's own
  // transcript (window [deliveredAt, close]), priced box-side at ingest
  // (src/app/api/orchestration/runs/[id]/usage). Null = never reported
  // (non-Claude adapter, runner predates the reporter, or zero usage).
  tokensIn: bigint("tokens_in", { mode: "number" }),
  tokensOut: bigint("tokens_out", { mode: "number" }),
  tokensCacheRead: bigint("tokens_cache_read", { mode: "number" }),
  tokensCacheWrite: bigint("tokens_cache_write", { mode: "number" }),
  /** Estimated USD at API list rates (subscription runs: comparable unit, not an invoice). */
  costUsd: doublePrecision("cost_usd"),
  usageDetail: jsonb("usage_detail").$type<OrchestrationRunUsageDetail>(),
  usageUpdatedAt: timestamp("usage_updated_at", { withTimezone: true }),
}, (table) => [
  index("idx_orchestration_runs_user_id").on(table.userId),
  index("idx_orchestration_runs_org_id").on(table.orgId),
  index("idx_orchestration_runs_project_id").on(table.projectId),
  index("idx_orchestration_runs_project_path").on(table.projectPath),
  index("idx_orchestration_runs_started_at").on(table.startedAt),
  // Powers getRecentOutcomes(userId, projectKey) — finishedAt DESC, partial-indexed to skip running rows
  index("idx_orchestration_runs_recent_outcomes").on(table.userId, table.projectKey, sql`finished_at DESC`),
]);

/** Non-column usage context stored alongside the token counters. */
export type OrchestrationRunUsageDetail = {
  /** Per-model token breakdown (pricing input — see src/config/model-pricing.ts). */
  models?: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>;
  /** Claude session ids that contributed usage in the run's window. */
  sessionIds?: string[];
  /** Model ids whose tokens had no pricing entry (cost is partial). */
  unpricedModels?: string[];
  /** ISO end of the last counted window (runner-side "as of"). */
  windowTo?: string;
  /** Set on the first accepted report after the run closed — later reports
   *  are refused so a long-lived session's NEXT run can't leak tokens into
   *  this one. */
  final?: boolean;
};

export type OrchestrationRun = typeof orchestrationRuns.$inferSelect;
export type NewOrchestrationRun = typeof orchestrationRuns.$inferInsert;
