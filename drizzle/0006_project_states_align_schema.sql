-- Schema drift fix: src/db/schema/project-states.ts declares agent_running,
-- tab_open, active_agents, lock_at as part of the live runtime state pushed
-- by the daemon every few seconds, but no migration ever added them. As a
-- result, every PATCH /api/project-states/<tab> from the local stop hook
-- returns 500 ("insert into project_states (...lock_at, agent_running...)"
-- on the prod instance) and the agent lifecycle is never recorded.
--
-- 0002 was supposed to switch project_states to a composite PK
-- (user_id, project_key) — this is idempotent re-application of that step
-- for instances where it never ran.

-- 1. Drop orphan rows so the composite-PK switch can succeed.
DELETE FROM "project_states" WHERE "user_id" IS NULL;

-- 2. user_id must participate in the composite PK.
ALTER TABLE "project_states" ALTER COLUMN "user_id" SET NOT NULL;

-- 3. Swap the PK to the composite shape Drizzle expects.
ALTER TABLE "project_states" DROP CONSTRAINT IF EXISTS "project_states_pkey";
ALTER TABLE "project_states"
  ADD CONSTRAINT "project_states_pkey" PRIMARY KEY ("user_id", "project_key");

-- 4. Add the runtime-state columns that the daemon push payload writes.
-- NOT NULL with sane defaults so existing rows backfill harmlessly.
ALTER TABLE "project_states"
  ADD COLUMN IF NOT EXISTS "agent_running" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tab_open"      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "active_agents" text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "lock_at"       timestamp with time zone;
