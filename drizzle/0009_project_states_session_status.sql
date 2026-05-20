-- Add session_status column to project_states.
--
-- Mirrors the new 'status' field in the canonical handoff format
-- (src/lib/orchestration/contract.ts:ORCHESTRATION_TASK_SUMMARY_FIELDS).
-- Value space: 'ready' | 'working' | NULL. The auto-inject gates in
-- src/hooks/use-project-card-actions.ts and src/app/beacon/[id]/BeaconClient.tsx
-- only fire when status === 'ready'; anything else (NULL included) suppresses.
--
-- Idempotent — `ADD COLUMN IF NOT EXISTS` lets the migration run more than
-- once without erroring if the column already exists on a partially-migrated
-- environment.

ALTER TABLE "project_states" ADD COLUMN IF NOT EXISTS "session_status" text;
