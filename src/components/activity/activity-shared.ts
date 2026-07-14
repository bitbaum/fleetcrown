import { APP_LOCALE } from "@/lib/constants";
import type { DigestWindow } from "@/db/queries/digests";
import type { StatusTone } from "@/lib/constants/statuses";

// ─── Density (UI-only concept, not in the data layer) ────────────────────────

export const DENSITIES = ["compact", "detailed"] as const;
export type Density = (typeof DENSITIES)[number];

export function normalizeDensity(value: string | undefined): Density {
  return DENSITIES.includes(value as Density) ? (value as Density) : "compact";
}

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

// ─── Status → dot class (SSOT for the colored circles) ──────────────────────

export const STATUS_DOT_CLASS: Record<StatusTone, string> = {
  negative: "ui-dot-negative",
  warning: "ui-dot-warning",
  positive: "ui-dot-positive",
  neutral: "bg-text-tertiary",
};

// ─── URL builder for in-page navigations ─────────────────────────────────────
// All filter changes (window, project, density) flow through this. Defaults
// are stripped so URLs stay clean: /activity for the default view.

export function activityHref(opts: {
  window?: DigestWindow;
  project?: string | null;
  density?: Density;
}): string {
  const params = new URLSearchParams();
  if (opts.window && opts.window !== "day") params.set("window", opts.window);
  if (opts.project) params.set("project", opts.project);
  if (opts.density && opts.density !== "compact") params.set("density", opts.density);
  const qs = params.toString();
  return qs ? `/activity?${qs}` : "/activity";
}

// ─── Locale-aware time formatter ─────────────────────────────────────────────

export function formatActivityTime(iso: string): string {
  return new Date(iso).toLocaleString(APP_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
