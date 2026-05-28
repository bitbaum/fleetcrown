ALTER TABLE runtime_snapshots
  ADD COLUMN IF NOT EXISTS installed_agents TEXT[] NOT NULL DEFAULT '{}';
