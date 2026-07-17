import { isPast, formatDistanceToNow } from "date-fns";
import { FREQUENCY } from "@/config/subscriptions";
import { DAY_MS, MINUTE_MS } from "@/lib/constants/time";

/** "just now" / "5m ago" / "2h ago" — minute-precision, from epoch ms */
export function timeAgo(ms: number): string {
  const diff = Math.round((Date.now() - ms) / MINUTE_MS);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  return `${Math.round(diff / 60)}h ago`;
}

/** Ultra-compact relative time for dense lists: "now" / "5m" / "3h" / "2d" /
 *  "3w" / "5mo" / "1y" — from epoch ms. Unlike timeAgo it keeps scaling past
 *  hours, so a history rail of same-titled items stays distinguishable. */
export function shortTimeAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7); if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
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
  const diffDays = Math.floor(diffMs / DAY_MS);
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

/**
 * Compact elapsed duration from a whole-second count: "45s" / "3m 12s" /
 * "1h 20m". Seconds are only shown below an hour; once past an hour the
 * display drops to hour+minute granularity. Used for live run timers.
 */
export function formatElapsedSeconds(seconds: number): string {
  if (seconds >= 3600) {
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Compact duration from a whole-minute count: "<1m" / "42m" / "1h 3m".
 * Sub-minute durations collapse to "<1m" (the caller has already rounded to
 * minutes, so a real zero is indistinguishable from "just under a minute").
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
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
