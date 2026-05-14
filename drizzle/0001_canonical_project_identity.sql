ALTER TABLE "user_projects"
  ADD COLUMN IF NOT EXISTS "entity_project_id" uuid REFERENCES "entities"("id") ON DELETE SET NULL;

ALTER TABLE "project_states"
  ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "entities"("id") ON DELETE SET NULL;

ALTER TABLE "prompt_history"
  ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "entities"("id") ON DELETE SET NULL;

ALTER TABLE "orchestration_runs"
  ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "entities"("id") ON DELETE SET NULL;

ALTER TABLE "orchestration_events"
  ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "entities"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_user_projects_entity_project_id"
  ON "user_projects" ("entity_project_id");

CREATE INDEX IF NOT EXISTS "idx_project_states_project_id"
  ON "project_states" ("project_id");

CREATE INDEX IF NOT EXISTS "idx_prompt_history_project_id"
  ON "prompt_history" ("project_id");

CREATE INDEX IF NOT EXISTS "idx_orchestration_runs_project_id"
  ON "orchestration_runs" ("project_id");

CREATE INDEX IF NOT EXISTS "idx_orch_events_project_id_time"
  ON "orchestration_events" ("project_id", "happened_at");

UPDATE "user_projects" up
SET "entity_project_id" = e."id"
FROM "entities" e
WHERE up."entity_project_id" IS NULL
  AND e."user_id" = up."user_id"
  AND e."type" = 'project'
  AND e."name" = up."name";
