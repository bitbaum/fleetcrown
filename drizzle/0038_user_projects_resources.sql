ALTER TABLE "user_projects"
  ADD COLUMN IF NOT EXISTS "resources" jsonb NOT NULL DEFAULT '[]'::jsonb;
