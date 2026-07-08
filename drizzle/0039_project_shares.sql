CREATE TABLE IF NOT EXISTS "project_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "entities"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token" text NOT NULL UNIQUE,
  "audience" text NOT NULL DEFAULT 'advisor',
  "include_roadmap" boolean NOT NULL DEFAULT true,
  "include_changelog" boolean NOT NULL DEFAULT true,
  "include_resources" boolean NOT NULL DEFAULT true,
  "include_repo" boolean NOT NULL DEFAULT false,
  "include_live_url" boolean NOT NULL DEFAULT true,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_project_shares_token" ON "project_shares" ("token");
CREATE INDEX IF NOT EXISTS "idx_project_shares_project_id" ON "project_shares" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_shares_user_id" ON "project_shares" ("user_id");
