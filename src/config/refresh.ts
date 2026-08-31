/**
 * SSOT for AutoRefresh poll cadences, per page. Each <AutoRefresh /> mount
 * imports the key matching its surface so the cadence is one edit away from
 * any future bandwidth or freshness change.
 *
 * Tuning guideline:
 *   - status surfaces with operational signals (system) want lower numbers
 *     so a fresh failure surfaces in seconds, not minutes
 *   - personal / write-heavy surfaces (today, memory, projects) want higher
 *     numbers because user-driven changes already trigger router.refresh
 *     via PullToRefresh / RefreshOnFocus + the data shifts slowly anyway
 *
 * Not env-tunable yet — YAGNI. If a deployment hits a bandwidth ceiling,
 * convert these to `Number(process.env.REFRESH_CADENCE_X ?? "30000")`.
 */
export const REFRESH_CADENCE = {
  system: 30_000,
  today: 60_000,
  memory: 60_000,
  projects: 60_000,
  // Client-widget useFetch polls (data changes slowly; endpoint patience stays per-widget)
  weather: 10 * 60_000,
  calendar: 5 * 60_000,
  projectsCi: 2 * 60_000,
} as const;
