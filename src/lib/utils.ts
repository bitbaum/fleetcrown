import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isValidUuid = (s: string) => UUID_RE.test(s);

export const RELATIONSHIP_HEALTH_VALUES = ["active", "fading", "stale", "unknown"] as const;
export type RelationshipHealth = typeof RELATIONSHIP_HEALTH_VALUES[number];

/** Threshold constants — single source of truth for both JS and SQL queries */
export const HEALTH_ACTIVE_DAYS = 14;
export const HEALTH_FADING_DAYS = 30;

/** < 14 days → active, < 30 days → fading, older → stale, null → unknown */
export function deriveRelationshipHealth(lastInteraction: Date | null): RelationshipHealth {
  if (!lastInteraction) return "unknown";
  const daysSince = (Date.now() - lastInteraction.getTime()) / 86_400_000;
  if (daysSince <= HEALTH_ACTIVE_DAYS) return "active";
  if (daysSince <= HEALTH_FADING_DAYS) return "fading";
  return "stale";
}

/** Tailwind dot color per health state — single source of truth */
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
