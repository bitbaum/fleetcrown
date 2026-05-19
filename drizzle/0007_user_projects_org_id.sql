-- Schema drift fix: src/db/schema/user-projects.ts declared org_id
-- (uuid → orgs.id, on delete set null) but no migration shipped it.
-- Every SELECT through Drizzle requests the column, so the query failed
-- on production, ensureUserProjectEntityLinks() landed in its .catch
-- returning [], and /api/control reported trackedProjectCount=0 — the
-- control panel rendered zero cards for the only signed-in user despite
-- 12 active user_projects rows in the DB.

ALTER TABLE "user_projects"
  ADD COLUMN IF NOT EXISTS "org_id" uuid REFERENCES "orgs"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_user_projects_org_id"
  ON "user_projects" ("org_id");
