-- widget_tokens: remote kill switch + boot heartbeat (feedback-widget Phase 1).
-- The orangecat_* CREATEs below are snapshot healing: both tables already exist
-- on prod and local (applied via direct DDL by an earlier session) but were
-- never captured in a drizzle snapshot, so drizzle-kit re-emitted them here.
-- Every statement is guarded so this file is a no-op where objects exist.
CREATE TABLE IF NOT EXISTS "orangecat_build_intents" (
	"jti" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orangecat_build_intents_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orangecat_entity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"role" text NOT NULL,
	"public_url" text NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "widget_tokens" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "widget_tokens" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "widget_tokens" ADD COLUMN IF NOT EXISTS "last_seen_origin" text;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "orangecat_build_intents" ADD CONSTRAINT "orangecat_build_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "orangecat_entity_links" ADD CONSTRAINT "orangecat_entity_links_project_id_user_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."user_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "orangecat_entity_links" ADD CONSTRAINT "orangecat_entity_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orangecat_build_intents_expiry" ON "orangecat_build_intents" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_orangecat_entity_links_edge" ON "orangecat_entity_links" USING btree ("project_id","entity_type","entity_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orangecat_entity_links_project" ON "orangecat_entity_links" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orangecat_entity_links_entity" ON "orangecat_entity_links" USING btree ("entity_type","entity_id");
