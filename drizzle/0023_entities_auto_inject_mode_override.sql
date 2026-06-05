-- Per-project autopilot mode override.
--
-- Today beacon_settings.auto_inject_mode is a single user-level value that
-- applies to every project. Users dogfooding multi-project workflows asked
-- to pin specific projects to a different tier (e.g., "strategist globally
-- but off for this one risky project while I iterate"). This column makes
-- that possible without touching beacon_settings — null = inherit.
--
-- Read by /api/control/dispatch + src/lib/orchestration/dispatch-gates.ts:
-- if entity.auto_inject_mode_override IS NOT NULL, use it; else fall back
-- to the user's beacon_settings.auto_inject_mode.
--
-- Validation: the application layer enforces that the value is one of
-- AUTO_INJECT_MODE_VALUES (src/config/beacon.ts). We do NOT add a CHECK
-- constraint here because the enum is owned by the TS code and rotating
-- values would require a coordinated migration; instead, the API layer
-- coerces unknown values to null on read so a future schema change can
-- happen without orphaning rows.

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS auto_inject_mode_override TEXT;

COMMENT ON COLUMN entities.auto_inject_mode_override IS
  'Per-project override for beacon_settings.auto_inject_mode. NULL = inherit the user-level mode.';
