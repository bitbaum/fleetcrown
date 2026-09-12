-- Migration: provider_quota — what each AI vendor last told us was left.
--
-- Written by hand rather than generated, matching 0065 and 0066: drizzle-kit
-- generate stops on an interactive rename prompt in this schema, and
-- apply-schema.sh globs numbered .sql files rather than reading the journal.
--
-- WHY THE TABLE EXISTS AT ALL
--
-- The obvious way to know remaining quota is to poll each provider's usage
-- endpoint. That design reports a FULL TANK DURING AN OUTAGE. Measured on one
-- live key, within the same second:
--
--   GET  /api/v1/key        ->  limit_remaining: null,  usage_daily: 0
--   POST /chat/completions  ->  429, x-ratelimit-remaining: 0 of 50,
--                               "Rate limit exceeded: free-models-per-day"
--
-- Both are OpenRouter's answers about the same account, and the account was
-- locked out. Its usage endpoint tracks money; free models cost nothing; the
-- limit that binds is a request count that endpoint never reports. So rows here
-- are written from rate-limit headers on answers already served — no extra
-- request, and no quota spent to find out how much quota is left.
--
-- ADDITIVE AND REVERSIBLE. New table only; nothing reads it until the Settings
-- page does, and dropping it would cost only the telemetry.

CREATE TABLE IF NOT EXISTS "provider_quota" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- Whose key this is. 'platform' for the shared keys the operator pays for
  -- (today: all of them); a user id once bring-your-own-key exists.
  --
  -- NOT a nullable user_id, deliberately: Postgres treats NULLs as DISTINCT in
  -- a unique constraint, so a nullable column would let the platform
  -- accumulate one duplicate row per observation and the upsert would never
  -- find its target — a rollup silently becoming an append-only log.
  "key_owner"    text NOT NULL DEFAULT 'platform',
  "provider"     text NOT NULL,
  -- Vendors meter per model (Groq gives each its own window), so it is part of
  -- the counter's identity, not a detail hanging off it.
  "model"        text NOT NULL,
  -- 'requests' | 'tokens'
  "scope"        text NOT NULL,
  -- 'minute' | 'day' | 'unknown'. Stored, never guessed: the same header name
  -- counts a day at one vendor and a minute at another, and a confident wrong
  -- window turns "900 left today" into "900 left this minute".
  "window"       text NOT NULL,
  "quota_limit"  integer,
  "remaining"    integer NOT NULL,
  "reset_at"     timestamp with time zone,
  -- Which header (or '429') this came from, so a wrong number is traceable to
  -- the thing that reported it.
  "source"       text NOT NULL,
  "observed_at"  timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- The upsert target. Without it, concurrent turns each insert and "the latest
-- reading" becomes a guess between duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_provider_quota_counter"
  ON "provider_quota" ("key_owner", "provider", "model", "scope", "window");
--> statement-breakpoint

-- The settings page reads every counter for one owner at once.
CREATE INDEX IF NOT EXISTS "idx_provider_quota_owner"
  ON "provider_quota" ("key_owner");
