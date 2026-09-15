-- Who SENT a piece of feedback, and how they follow it.
--
-- site_feedback already had a user_id: the project OWNER, the person who
-- RECEIVES the report. Nothing recorded the person who FILED it beyond a free
-- text `contact` field that is half names and half addresses. So the loop ended
-- at "Sent. Thank you." — a reporter had no way to learn whether their report
-- was ever looked at, and an operator had no way to show them.
--
-- Three columns close it:
--   submitter_email   normalized address, when they left one
--   submitter_user_id the Loki account that filed it, once bound
--   track_token       an unguessable capability: /f/<token> shows THIS report's
--                     status to whoever holds the link, with no account
--
-- track_token is nullable on purpose. Rows filed before this migration have no
-- public page and are not given one retroactively — a token minted now would
-- appear in no email and on no success screen, so it would only be a secret
-- nobody holds.
ALTER TABLE "site_feedback" ADD COLUMN IF NOT EXISTS "submitter_email" text;--> statement-breakpoint
ALTER TABLE "site_feedback" ADD COLUMN IF NOT EXISTS "submitter_user_id" uuid;--> statement-breakpoint
ALTER TABLE "site_feedback" ADD COLUMN IF NOT EXISTS "track_token" text;--> statement-breakpoint

-- ON DELETE SET NULL, not CASCADE: a reporter deleting their Loki account must
-- not delete the operator's inbox. The report was addressed to the project.
DO $$ BEGIN
  ALTER TABLE "site_feedback" ADD CONSTRAINT "site_feedback_submitter_user_id_users_id_fk"
    FOREIGN KEY ("submitter_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Unique because the token is the lookup key for the public page; a collision
-- would serve one person's report to another.
CREATE UNIQUE INDEX IF NOT EXISTS "site_feedback_track_token_unique" ON "site_feedback" USING btree ("track_token");--> statement-breakpoint
-- The Sent view matches on EITHER half of the claim rule, so index both.
CREATE INDEX IF NOT EXISTS "idx_site_feedback_submitter" ON "site_feedback" USING btree ("submitter_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_site_feedback_submitter_email" ON "site_feedback" USING btree ("submitter_email");
