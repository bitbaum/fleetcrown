import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isValidUuid = (s: string) => UUID_RE.test(s);

export type RelationshipHealth = "active" | "fading" | "stale" | "unknown";

/** < 14 days → active, < 30 days → fading, older → stale, null → unknown */
export function deriveRelationshipHealth(lastInteraction: Date | null): RelationshipHealth {
  if (!lastInteraction) return "unknown";
  const daysSince = (Date.now() - lastInteraction.getTime()) / 86_400_000;
  if (daysSince <= 14) return "active";
  if (daysSince <= 30) return "fading";
  return "stale";
}
