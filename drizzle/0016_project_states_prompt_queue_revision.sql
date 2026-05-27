ALTER TABLE "project_states"
  ADD COLUMN IF NOT EXISTS "prompt_queue_revision" integer NOT NULL DEFAULT 0;
