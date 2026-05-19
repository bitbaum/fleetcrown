-- Multi-tenancy fix: project_states.project_key is currently a global PK, which
-- means two users naming a project the same thing overwrite each other's runtime
-- state. Switch to a composite PK on (user_id, project_key) so each tenant owns
-- its own keyspace.

-- Orphan rows have no owner — they can't be migrated safely. Runtime state is
-- ephemeral (re-pushed by the daemon every few seconds), so dropping them is OK.
DELETE FROM "project_states" WHERE "user_id" IS NULL;

ALTER TABLE "project_states" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "project_states" DROP CONSTRAINT IF EXISTS "project_states_pkey";

ALTER TABLE "project_states"
  ADD CONSTRAINT "project_states_pkey" PRIMARY KEY ("user_id", "project_key");
