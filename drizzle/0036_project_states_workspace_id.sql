ALTER TABLE "project_states" ADD COLUMN IF NOT EXISTS "workspace_id" text;

UPDATE "project_states"
SET "workspace_id" = 'runner:' || lower("project_key")
WHERE "workspace_id" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_project_states_workspace_id"
ON "project_states" ("workspace_id");
