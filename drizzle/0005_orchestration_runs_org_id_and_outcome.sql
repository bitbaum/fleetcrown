-- Schema drift fix: src/db/schema/orchestration-runs.ts declared `orgId`
-- (uuid → orgs.id, on delete set null) and an `outcome` text enum, but no
-- migration shipped them. Production hit this when /api/orchestration/runs/<id>/finish
-- (the cloud-mode outcome-tracking loop) crashed with 500 because Drizzle's
-- .returning() RETURNING the schema columns referenced a missing org_id column.
ALTER TABLE "orchestration_runs"
  ADD COLUMN IF NOT EXISTS "org_id" uuid REFERENCES "orgs"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "outcome" text;

CREATE INDEX IF NOT EXISTS "idx_orchestration_runs_org_id"
  ON "orchestration_runs" ("org_id");

-- Partial index sized for getRecentOutcomes(user_id, project_key) — only
-- finished rows participate in the streak / dispatch-reasoner lookups.
CREATE INDEX IF NOT EXISTS "idx_orchestration_runs_recent_outcomes"
  ON "orchestration_runs" ("user_id", "project_key", "finished_at" DESC)
  WHERE "finished_at" IS NOT NULL;
