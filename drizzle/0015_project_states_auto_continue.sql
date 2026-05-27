ALTER TABLE "project_states"
  ADD COLUMN IF NOT EXISTS "auto_continue_enabled" boolean NOT NULL DEFAULT true;
