-- Runtime snapshot runner version.
--
-- The runner pushes its build/version so Control can distinguish cloud
-- box-runner from desktop Fleet Runner and avoid stale runtime claims.
-- Older production DBs had panes/installed_agents but not this column.
ALTER TABLE runtime_snapshots
  ADD COLUMN IF NOT EXISTS runner_version text;
