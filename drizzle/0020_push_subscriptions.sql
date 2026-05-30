-- Web Push subscriptions — one row per (user × device-browser). Endpoint
-- is the push-service-issued URL; UNIQUE so resubscribing upserts cleanly.
-- The autopilot Stop hook (agent-hook-bridge.sh push_notify_stop) fans a
-- notification to every row for the calling daemon's user.

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint"     text NOT NULL UNIQUE,
  "p256dh"       text NOT NULL,
  "auth"         text NOT NULL,
  "user_agent"   text,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_push_subscriptions_user_id"
  ON "push_subscriptions" ("user_id");
