ALTER TABLE "project_states"
  ADD COLUMN IF NOT EXISTS "runtime_observed_at" timestamp with time zone;

ALTER TABLE "runtime_snapshots"
  ADD COLUMN IF NOT EXISTS "observed_at" timestamp with time zone;
