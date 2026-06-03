-- Adds the OrangeCat back-link so the /money page can render a
-- "Synced ✓" badge per subscription and so future backfills know which
-- rows have already been mirrored. NULL = not mirrored (integration off,
-- sync failed, or row predates the integration).

ALTER TABLE "subscriptions" ADD COLUMN "orangecat_service_id" uuid;

-- Partial index helps the small "what still needs syncing" query the
-- backfill job will run; the column is mostly null for now.
CREATE INDEX IF NOT EXISTS "idx_subscriptions_orangecat_pending"
  ON "subscriptions" ("user_id")
  WHERE "orangecat_service_id" IS NULL;
