-- Add structured loop-control columns referenced by src/db/schema/project-states.ts
-- (sessionBlockReason, sessionNoOpCount). Both were added to the schema in commit
-- 729237c without a generated SQL migration, so prod was missing them, causing
-- every SELECT on project_states to crash with 42703 (errorMissingColumn).
ALTER TABLE project_states
  ADD COLUMN IF NOT EXISTS session_block_reason text,
  ADD COLUMN IF NOT EXISTS session_no_op_count integer;
