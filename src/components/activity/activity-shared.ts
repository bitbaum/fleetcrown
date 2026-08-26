import { APP_LOCALE } from "@/lib/constants";
import type { DigestWindow } from "@/db/queries/digests";
import type { ActivityFilter, ActivityOutcome } from "@/lib/activity-events";
import type { StatusTone } from "@/lib/constants/statuses";

// Density used to be a page-wide compact/detailed switch. It is gone: each row
// now expands on its own, so "show me more of THIS one" no longer means
// "reflow the entire page". The URL param is ignored rather than redirected —
// an old bookmark still lands on a working page.

// ─── Labels (humanized variants of the typed enums) ──────────────────────────

export const WINDOW_LABEL: Record<DigestWindow, string> = {
  hour: "Hour",
  day: "Day",
  week: "Week",
  month: "Month",
};

export const RANGE_LABEL: Record<DigestWindow, string> = {
  hour: "the last hour",
  day: "the last 24 hours",
  week: "the last 7 days",
  month: "the last 30 days",
};

export const FILTER_LABEL: Record<ActivityFilter, string> = {
  all: "All",
  attention: "Needs attention",
  running: "Running",
  done: "Done",
};

// ─── Status → dot class (SSOT for the colored circles) ──────────────────────

export const STATUS_DOT_CLASS: Record<StatusTone, string> = {
  negative: "ui-dot-negative",
  warning: "ui-dot-warning",
  positive: "ui-dot-positive",
  neutral: "bg-text-tertiary",
};

/**
 * Outcome → tag variant. Paired with the base `.ui-tag` class at every call
 * site: `.ui-tag-*` alone sets colors and a border-COLOR, but not the border
 * width, radius or padding that make it read as a chip.
 */
export const OUTCOME_TAG_CLASS: Record<ActivityOutcome, string> = {
  error: "ui-tag-negative",
  timeout: "ui-tag-negative",
  hang: "ui-tag-negative",
  user_abort: "ui-tag-warning",
  partial: "ui-tag-warning",
  running: "ui-tag-accent",
  success: "ui-tag-positive",
  dispatched: "ui-tag-neutral",
};

// ─── URL builder for in-page navigations ─────────────────────────────────────
// All filter changes (window, project, status) flow through this.
// Defaults are stripped so URLs stay clean: /activity for the default view.

export function activityHref(opts: {
  window?: DigestWindow;
  project?: string | null;
  filter?: ActivityFilter;
}): string {
  const params = new URLSearchParams();
  if (opts.window && opts.window !== "day") params.set("window", opts.window);
  if (opts.project) params.set("project", opts.project);
  if (opts.filter && opts.filter !== "all") params.set("status", opts.filter);
  const qs = params.toString();
  return qs ? `/activity?${qs}` : "/activity";
}

// ─── Time formatting ─────────────────────────────────────────────────────────

/** Full stamp — used where a date is genuinely needed (range labels). */
export function formatActivityTime(iso: string): string {
  return new Date(iso).toLocaleString(APP_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Clock only. Rows live under a day heading, so repeating the date on all
 * twenty of them (the old "26 Aug, 04:00" on every line) spent the scarcest
 * column on the least surprising fact.
 */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(APP_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Today" / "Yesterday" / "Mon, 25 Aug" for a YYYY-MM-DD bucket key. */
export function formatDayHeading(day: string, now = new Date()): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((startOfToday.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(APP_LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
