import { isPast, formatDistanceToNow } from "date-fns";

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
