/**
 * Fair-share rationing — now owned by `ai-ration`.
 *
 * The policy was always pure (no DB, no clock, no provider), which is exactly
 * what made it liftable: it was written here, proved here, and then extracted so
 * the other projects in the fleet inherit the same rationing instead of each
 * growing its own. This file stays as the import path FleetCrown already uses,
 * so adopting the package did not touch a single caller.
 *
 * Keep it a re-export. A local re-implementation "just for one tweak" is how the
 * shared version becomes the stale version — the fix that lands upstream then
 * silently never reaches here.
 */
export {
  DAY_SECONDS,
  DEFAULT_BURST,
  type ShareInput,
  type ShareReason,
  type ShareDecision,
  fairShare,
  utcDayElapsed,
  utcDayKey,
} from "ai-ration";
