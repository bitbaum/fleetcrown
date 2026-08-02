CREATE TABLE "run_escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_key" text NOT NULL,
	"level" text NOT NULL,
	"fail_streak" integer NOT NULL,
	"last_run_id" uuid,
	"last_outcome" text,
	"last_error" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
ALTER TABLE "run_escalations" ADD CONSTRAINT "run_escalations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_run_escalations_open" ON "run_escalations" USING btree ("user_id","project_key","resolved_at");--> statement-breakpoint
CREATE INDEX "idx_run_escalations_opened_at" ON "run_escalations" USING btree ("opened_at");