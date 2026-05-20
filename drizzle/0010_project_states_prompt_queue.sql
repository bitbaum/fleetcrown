-- Move the per-project prompt queue from /tmp/agent-queue-<tab> to
-- project_states.prompt_queue so it persists across browsers and across
-- Vercel cold starts (the /tmp mirror is ephemeral on serverless and only
-- durable on local cockpit-app machines).
--
-- text[] (not jsonb) since the queue is always a flat list of prompt
-- strings — matches the existing activeAgents column shape, no JSON
-- parsing overhead, native Postgres array semantics.
--
-- Idempotent — ADD COLUMN IF NOT EXISTS lets the migration re-run on a
-- partially-migrated environment without erroring.

ALTER TABLE "project_states"
  ADD COLUMN IF NOT EXISTS "prompt_queue" text[] NOT NULL DEFAULT '{}';
