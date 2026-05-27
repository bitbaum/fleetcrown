ALTER TABLE "orchestration_events"
  ADD COLUMN IF NOT EXISTS "dedupe_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "orchestration_events_dedupe_key_unique"
  ON "orchestration_events" ("dedupe_key");
