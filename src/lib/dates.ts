import { isPast, formatDistanceToNow } from "date-fns";

/**
 * Format a Date as YYYY-MM-DD in *local* time. Habit tracking relies on
 * the local calendar day (not UTC), so toISOString is wrong here.
 */
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Standard "Overdue / Due X" phrasing used across deadline displays
 * (events, goals, project deadlines). Returns the formatted label and
 * the overdue flag so callers can colour their wrapping element.
 */
export function deadlineLabel(date: Date | string | null | undefined): {
  label: string;
  overdue: boolean;
} {
  if (!date) return { label: "", overdue: false };
  const d = date instanceof Date ? date : new Date(date);
  const overdue = isPast(d);
  return {
    label: `${overdue ? "Overdue" : "Due"} ${formatDistanceToNow(d, { addSuffix: true })}`,
    overdue,
  };
}
