-- Connection-based runner presence (replaces the heartbeat-freshness guess).
-- Written by the bridge on runner SSE connect/disconnect.
-- Idempotent + additive: safe to apply to a live DB; nothing reads it until
-- the web cutover. See docs/architecture/connection-presence.md.
CREATE TABLE IF NOT EXISTS "runner_presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"connection_count" integer DEFAULT 0 NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"connected_at" timestamp with time zone,
	"last_change_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "runner_presence" ADD CONSTRAINT "runner_presence_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
