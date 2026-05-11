import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isValidUuid = (s: string) => UUID_RE.test(s);

// Re-exported from their canonical home; import from @/lib/constants/people instead.
export {
  RELATIONSHIP_HEALTH_VALUES,
  type RelationshipHealth,
  HEALTH_ACTIVE_DAYS,
  HEALTH_FADING_DAYS,
  deriveRelationshipHealth,
  HEALTH_DOT_COLOR,
  HEALTH_LABEL,
} from "@/lib/constants/people";
