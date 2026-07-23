CREATE TABLE IF NOT EXISTS orangecat_entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES user_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  role text NOT NULL,
  public_url text NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orangecat_entity_links_role_check
    CHECK (role IN ('origin', 'public_profile', 'funding', 'offering', 'community'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orangecat_entity_links_edge
  ON orangecat_entity_links(project_id, entity_type, entity_id, role);
CREATE INDEX IF NOT EXISTS idx_orangecat_entity_links_project
  ON orangecat_entity_links(project_id);
CREATE INDEX IF NOT EXISTS idx_orangecat_entity_links_entity
  ON orangecat_entity_links(entity_type, entity_id);

-- Preserve every legacy project bridge as a typed funding/public edge. The old
-- column remains in place until all deployed readers have moved to this table.
INSERT INTO orangecat_entity_links (
  project_id,
  user_id,
  entity_type,
  entity_id,
  role,
  public_url,
  title
)
SELECT
  up.id,
  up.user_id,
  'project',
  up.orangecat_project_id,
  'funding',
  'https://orangecat.ch/projects/' || up.orangecat_project_id::text,
  up.name
FROM user_projects up
WHERE up.orangecat_project_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS orangecat_build_intents (
  jti text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orangecat_build_intents_expiry
  ON orangecat_build_intents(expires_at);
