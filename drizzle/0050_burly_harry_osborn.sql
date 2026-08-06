CREATE TABLE "site_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_url" text NOT NULL,
	"final_url" text,
	"status_code" integer,
	"ok" boolean DEFAULT false NOT NULL,
	"response_ms" integer,
	"title" text,
	"description" text,
	"preview_image_url" text,
	"outbound_hosts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_projects" ADD COLUMN "live_url" text;--> statement-breakpoint
ALTER TABLE "site_snapshots" ADD CONSTRAINT "site_snapshots_project_id_user_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."user_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_snapshots" ADD CONSTRAINT "site_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_site_snapshots_project" ON "site_snapshots" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_site_snapshots_user" ON "site_snapshots" USING btree ("user_id");