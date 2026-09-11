/**
 * Small pure helpers shared by every Fact adapter.
 *
 * Kept apart from sources.ts so the adapters can be split by domain without
 * importing each other (sources.ts → sources-work.ts → sources.ts would be a
 * cycle whose module-init order nobody wants to reason about).
 */

/**
 * Date rendered for a fact value: calendar day, no time, no locale guessing.
 * A fact carries what was stored, and a timestamp's clock component is noise
 * the model will otherwise try to reason about.
 */
export function dateLabel(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Date AND clock, to the minute, in UTC — for records where "when" is the
 * point (a run that started 40 minutes ago, feedback filed at 07:33). The
 * calendar-day label above throws that away, and "most recent" questions are
 * answered by exactly the part it throws away.
 */
export function timeLabel(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * How long ago, in words a person would use — "3 minutes ago", "2 days ago".
 * Rendered NEXT TO the absolute time, never instead of it: the model is told
 * both so it can say "40 minutes ago (07:33 UTC)" without doing arithmetic,
 * which is the one operation small models get wrong most reliably.
 */
export function agoLabel(d: Date | string | null | undefined, now = new Date()): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  const ms = now.getTime() - date.getTime();
  if (ms < 0) return "in the future";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Collapse whitespace and cap length — for free text that enters a prompt. */
export function excerpt(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
