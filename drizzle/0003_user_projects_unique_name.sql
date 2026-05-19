-- One project name per owner. Feeds project_states' (user_id, project_key) PK —
-- without this, a user could register two "cockpit" projects and their runtime
-- state would silently merge under the same composite key.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_projects_user_name"
  ON "user_projects" ("user_id", "name");
