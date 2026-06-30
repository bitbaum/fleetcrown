-- Split runner presence into cloud (box-runner) vs local (desktop Fleet Runner).
-- Bridge increments the matching channel on SSE connect/disconnect.
-- See docs/architecture/connection-presence.md + priority-plan A4.
ALTER TABLE "runner_presence" ADD COLUMN IF NOT EXISTS "cloud_connection_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "runner_presence" ADD COLUMN IF NOT EXISTS "local_connection_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "runner_presence" ADD COLUMN IF NOT EXISTS "cloud_connected" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "runner_presence" ADD COLUMN IF NOT EXISTS "local_connected" boolean DEFAULT false NOT NULL;
