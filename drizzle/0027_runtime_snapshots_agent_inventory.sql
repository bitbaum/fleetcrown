-- Runtime snapshot agent inventory.
--
-- The daemon pushes both the tabs it can see and the agent CLIs installed on
-- the machine. Older local databases only had open_tabs/updated_at, so the
-- runtime-state endpoint failed when inserting installed_agents.

ALTER TABLE runtime_snapshots
  ADD COLUMN IF NOT EXISTS installed_agents text[] NOT NULL DEFAULT '{}';

ALTER TABLE runtime_snapshots
  ADD COLUMN IF NOT EXISTS panes jsonb NOT NULL DEFAULT '[]'::jsonb;
