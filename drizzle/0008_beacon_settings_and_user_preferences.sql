-- Schema drift fix: src/db/schema/beacon-settings.ts and user-preferences.ts
-- declared two tables that no migration ever created. Production was hitting
-- "HTTP 500" on /api/beacon-settings (and silently failing on the location /
-- timezone read paths) because every query through Drizzle resolves to a
-- nonexistent table.

CREATE TABLE IF NOT EXISTS "beacon_settings" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                 uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "popup_mode"              text NOT NULL DEFAULT 'web',
  "countdown_seconds"       integer NOT NULL DEFAULT 12,
  "min_idle_seconds"        integer NOT NULL DEFAULT 0,
  "whisper_model"           text NOT NULL DEFAULT 'base',
  "transcription_provider"  text NOT NULL DEFAULT 'auto',
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_beacon_settings_user_id"
  ON "beacon_settings" ("user_id");

CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"             uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "home_city"           text,
  "home_timezone"       text,
  "home_locale"         text,
  "current_city"        text,
  "current_timezone"    text,
  "current_city_until"  date,
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_preferences_user_id"
  ON "user_preferences" ("user_id");
