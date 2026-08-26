import { isPast, formatDistanceToNow } from "date-fns";
import { FREQUENCY } from "@/config/subscriptions";
import { DAY_MS } from "@/lib/constants/time";

/**
 * THE elapsed-time ladder. One definition of how long ago something was; the
 * renderers below only choose words for it.
 *
 * This repo used to carry three: `timeAgo` (capped at hours), `shortTimeAgo`
 * (kept scaling, and said so in a comment right next to the one that did not),
 * and `agoLabel` in lib/atlas/format.ts — which existed only because
 * `${shortTimeAgo(t)} ago` printed the phrase "now ago" during the first
 * minute after a check, i.e. exactly when someone is looking. Three ladders
 * produced three bugs: "288h ago" for a twelve-day-old handoff, "now ago" at
 * three call sites that appended the word by hand, and a silent disagreement
 * about when weeks begin.
 *
 * Floors rather than rounds, at every tier: an elapsed label must never claim
 * more time has passed than actually has. Clamps future timestamps to zero,
 * because the browser's clock and the box's clock disagree by seconds and a
 * negative age is not a thing a human can read.
 *
 * Days run all the way to 30 before months take over. For a stale handoff
 * "21d ago" is the actionable reading and "3w ago" throws away the precision
 * that makes it so.
 */
export type ElapsedUnit = "now" | "m" | "h" | "d" | "mo" | "y";
export type Elapsed = { value: number; unit: ElapsedUnit };

export function elapsedSince(ms: number): Elapsed {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return { value: 0, unit: "now" };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { value: minutes, unit: "m" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { value: hours, unit: "h" };
  const days = Math.floor(hours / 24);
  if (days <= 30) return { value: days, unit: "d" };
  const months = Math.floor(days / 30);
  if (months < 12) return { value: months, unit: "mo" };
  return { value: Math.floor(days / 365), unit: "y" };
}

/**
 * "just now" / "5m ago" / "2h ago" / "12d ago" — the ladder as a sentence
 * fragment. THE ONLY place the word "ago" is appended: a caller that writes
 * `${shortTimeAgo(t)} ago` is reintroducing the "now ago" bug.
 */
export function timeAgo(ms: number): string {
  const { value, unit } = elapsedSince(ms);
  return unit === "now" ? "just now" : `${value}${unit} ago`;
}

/** The same ladder as a bare token — "now" / "5m" / "12d" — for dense lists
 *  where the column header already supplies the "ago". */
export function shortTimeAgo(ms: number): string {
  const { value, unit } = elapsedSince(ms);
  return unit === "now" ? "now" : `${value}${unit}`;
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

/** Compact human duration from hours: "45m", "3h", "2d". Feedback-loop
 *  metrics ("median 2d report→fix") and any other latency display. */
export function compactDurationHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
