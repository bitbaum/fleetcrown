-- Escalation ladders: repair the rows the old rule stranded, then make the
-- "one open ladder per project" invariant enforceable.
--
-- Order matters. The unique index at the bottom CANNOT be created against
-- production as it stands: orangecat holds three open rows and datacat two,
-- from a read-then-insert race in the reaper. Both repairs must run first.
--
-- The outcome names below are spelled out rather than imported, because a
-- migration is a snapshot of history — it must keep meaning what it meant on
-- the day it ran, even if FAILING_OUTCOMES (src/lib/events.ts) changes later.

--> statement-breakpoint
-- 1. Retro-apply the fixed rule.
--
-- The ladder used to resolve only on `outcome = 'success'` while advancing on
-- error/hang/timeout, so `partial` — the most common outcome there is — could
-- neither advance a ladder nor clear one. Seventeen ladders were open with no
-- exit; surf-your-life had sat at the top rung for 13 days across 7 partials.
--
-- Under the new rule any close where work landed resolves the ladder. Applying
-- that to history clears exactly the rows that were already earned out, and
-- leaves genuinely-stuck projects (no qualifying run since opening) open, which
-- is the point — this repairs the bug without erasing the signal.
UPDATE "run_escalations" e
SET "resolved_at" = now(), "resolved_by" = 'progress', "updated_at" = now()
WHERE e."resolved_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "orchestration_runs" r
    WHERE r."user_id" = e."user_id"
      AND r."project_key" = e."project_key"
      AND r."finished_at" IS NOT NULL
      AND r."finished_at" > e."opened_at"
      AND r."outcome" IS NOT NULL
      AND r."outcome" NOT IN ('error', 'hang', 'timeout', 'user_abort')
  );

--> statement-breakpoint
-- 2. Collapse the race duplicates that remain.
--
-- Keep the furthest-advanced row per project — it carries the streak closest to
-- the real consecutive-failure count, since the race split one project's
-- failures across several ladders. The losers are closed as 'superseded' rather
-- than deleted: the escalation RATE per rung is what this table exists to
-- measure, and analysis can exclude a reason it can see.
UPDATE "run_escalations" e
SET "resolved_at" = now(), "resolved_by" = 'superseded', "updated_at" = now()
WHERE e."resolved_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "run_escalations" k
    WHERE k."user_id" = e."user_id"
      AND k."project_key" = e."project_key"
      AND k."resolved_at" IS NULL
      AND (k."fail_streak", k."opened_at", k."id") > (e."fail_streak", e."opened_at", e."id")
  );

--> statement-breakpoint
CREATE UNIQUE INDEX "uq_run_escalations_one_open_per_project" ON "run_escalations" USING btree ("user_id","project_key") WHERE "run_escalations"."resolved_at" is null;
