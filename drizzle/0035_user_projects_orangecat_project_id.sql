-- Cross-product identity bridge Part C: the published OrangeCat project this
-- FleetCrown project projects onto (opt-in, per project). Null = not published.
ALTER TABLE user_projects
  ADD COLUMN IF NOT EXISTS orangecat_project_id uuid;
