CREATE TABLE IF NOT EXISTS "run_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "orchestration_runs"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "detail" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_run_events_run_id"
ON "run_events" ("run_id");

CREATE INDEX IF NOT EXISTS "idx_run_events_user_created"
ON "run_events" ("user_id", "created_at");
