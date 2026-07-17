import { DAY_MS } from "@/lib/constants/time";

/** Threshold constants — single source of truth for both JS and SQL queries */
export const HEALTH_ACTIVE_DAYS = 14;
export const HEALTH_FADING_DAYS = 30;

export const RELATIONSHIP_HEALTH_VALUES = ["active", "fading", "stale", "unknown"] as const;
export type RelationshipHealth = typeof RELATIONSHIP_HEALTH_VALUES[number];

/** < 14 days → active, < 30 days → fading, older → stale, null → unknown */
export function deriveRelationshipHealth(lastInteraction: Date | null): RelationshipHealth {
  if (!lastInteraction) return "unknown";
  const daysSince = (Date.now() - lastInteraction.getTime()) / DAY_MS;
  if (daysSince <= HEALTH_ACTIVE_DAYS) return "active";
  if (daysSince <= HEALTH_FADING_DAYS) return "fading";
  return "stale";
}

/** Tailwind dot color per health state */
export const HEALTH_DOT_COLOR: Record<RelationshipHealth, string> = {
  active:  "bg-status-positive",
  fading:  "bg-status-warning",
  stale:   "bg-status-negative",
  unknown: "bg-status-neutral",
};

/** Display labels for health values — used in filter chips and badges */
export const HEALTH_LABEL: Record<RelationshipHealth, string> = {
  active:  "Active",
  fading:  "Fading",
  stale:   "Stale",
  unknown: "Unknown",
};
