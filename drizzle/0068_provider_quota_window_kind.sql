-- Migration: provider_quota.window -> window_kind
--
-- `window` is a RESERVED WORD in Postgres. The application was never at risk —
-- drizzle quotes identifiers and 0067 declared the column as "window" — but
-- every hand-written query against this table would have needed the quotes
-- forever, and the very first ad-hoc SELECT written against it failed with a
-- syntax error pointing at the wrong token.
--
-- Renamed one day after the table shipped, while it held a single row. The cost
-- of this rename only ever goes up.
--
-- IDEMPOTENT AND SAFE TO RE-RUN. The applier is forward-only and re-runnable,
-- and a plain ALTER ... RENAME would fail the second time. The guard checks for
-- the OLD column rather than the new one so a half-applied state resolves the
-- same way. Not destructive: no data is dropped, only relabelled — the box's
-- applier refuses destructive statements outright.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_quota'
      AND column_name = 'window'
  ) THEN
    ALTER TABLE "provider_quota" RENAME COLUMN "window" TO "window_kind";
  END IF;
END
$$;
--> statement-breakpoint

-- 0067 is deliberately left UNTOUCHED, still declaring "window". It is recorded
-- in the box's _deploy_schema_history and describes what actually ran there;
-- editing an applied migration makes the file a lie about the database. A fresh
-- database therefore creates "window" via 0067 and is renamed by this file,
-- reaching the same place by the same path as production did.
--
-- The unique index names its columns, so Postgres carries it through the rename
-- automatically. Restated only so a database in either state ends up with an
-- index over the new name; IF NOT EXISTS makes it a no-op where it already is.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_provider_quota_counter"
  ON "provider_quota" ("key_owner", "provider", "model", "scope", "window_kind");
