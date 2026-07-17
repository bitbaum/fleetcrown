/**
 * SSOT: which routes show FleetCrown's own dogfood feedback widget
 * (docs/architecture/feedback-widget.md, Phase 4). Public marketing/content
 * surface only — the widget FAB would collide with the app shell's mobile
 * nav, and in-app feedback already has Loki.
 *
 * "/" is matched exactly; everything else by prefix.
 */
export const FEEDBACK_WIDGET_PUBLIC_PREFIXES = [
  "/",
  "/thoughts",
  "/frontier",
  "/mission",
  "/philosophy",
  "/roadmap",
  "/pricing",
  "/download",
  "/whitepaper",
  "/investors",
  "/releases",
] as const;

export function isFeedbackWidgetRoute(pathname: string): boolean {
  return FEEDBACK_WIDGET_PUBLIC_PREFIXES.some((p) =>
    p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`),
  );
}
