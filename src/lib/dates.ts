import { isPast, formatDistanceToNow } from "date-fns";
import { FREQUENCY } from "@/config/subscriptions";

/** "just now" / "5m ago" / "2h ago" — minute-precision, from epoch ms */
export function timeAgo(ms: number): string {
  const diff = Math.round((Date.now() - ms) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  return `${Math.round(diff / 60)}h ago`;
}

/** Compact elapsed display: "12s" / "3m" / "1h" — from epoch seconds */
export function secondsAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

/**
 * Format a Date as YYYY-MM-DD in *local* time. Habit tracking relies on
 * the local calendar day (not UTC), so toISOString is wrong here.
 */
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Compact "time ago" phrasing: "today", "yesterday", "5d ago", "2w ago",
 * "3mo ago". Smaller than date-fns formatDistanceToNow's word-based
 * output — used for dense list rows where space matters.
 */
export function compactRelativeDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
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

/** Advance a subscription due date by one billing period. */
export function advanceDueDate(current: string | null, frequency: string | null): string {
  const base = current ? new Date(current) : new Date();
  switch (frequency) {
    case FREQUENCY.ANNUAL:    base.setFullYear(base.getFullYear() + 1); break;
    case FREQUENCY.QUARTERLY: base.setMonth(base.getMonth() + 3); break;
    case FREQUENCY.WEEKLY:    base.setDate(base.getDate() + 7); break;
    default:                  base.setMonth(base.getMonth() + 1); break; // monthly
  }
  return base.toISOString();
}
