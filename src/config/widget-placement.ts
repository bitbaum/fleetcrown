/**
 * SSOT for where the embedded feedback launcher sits on a customer's page.
 *
 * The problem this exists to solve: every mainstream chat/support widget
 * (Intercom, Crisp, Tawk, Drift, and most in-house AI assistants) defaults to
 * the bottom-right corner. So does ours. On any site running both, one covers
 * the other — and because our launcher carries a near-maximum z-index, we are
 * usually the one on top, hiding *their* control.
 *
 * Before this file the only escape was a `data-fc-bottom` attribute on the
 * script tag, which means editing the customer's HTML: not something an
 * operator can do in one click, and impossible on a site we do not deploy.
 *
 * Placement now travels with the TOKEN and is served by /api/widget-boot, so
 * changing it is a dashboard action that reaches every page load within the
 * boot cache window. The snippet stays a pointer, exactly like the pause
 * switch — that is the whole design idea of the boot call.
 *
 * Three layers cooperate, deliberately, because none of them is reliable
 * alone:
 *   1. AUTO — the widget looks at its corner and steps aside if occupied.
 *      Handles sites nobody has configured, including ones we do not know run
 *      a chat widget. Cannot know intent.
 *   2. OPERATOR — the value in this file, chosen in FleetCrown. Knows intent,
 *      but only after a human notices.
 *   3. VISITOR — move/hide in the widget itself, kept in localStorage. Catches
 *      what the other two got wrong, for the one person it is hurting.
 */

/** The four corners a launcher may occupy. Ordered as they read in the picker. */
export const WIDGET_CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;
export type WidgetCorner = (typeof WIDGET_CORNERS)[number];

export const WIDGET_CORNER_LABELS: Record<WidgetCorner, string> = {
  "bottom-right": "Bottom right",
  "bottom-left": "Bottom left",
  "top-right": "Top right",
  "top-left": "Top left",
};

/**
 * Distance from the two edges of the chosen corner, in CSS pixels.
 *
 * Bounded rather than free: a negative value pushes the launcher off-screen
 * where nobody can reach it, and a very large one parks it in the middle of
 * the page looking like a bug. 240 is enough to clear any stacked launcher
 * plus a cookie bar, which is the real reason anyone reaches for this.
 */
export const WIDGET_OFFSET_MIN = 0;
export const WIDGET_OFFSET_MAX = 240;

/** Matches the CSS in widget/main.ts. Changing one without the other makes the
 *  dashboard preview lie about where the launcher actually lands. */
export const WIDGET_OFFSET_DEFAULT = 16;

export interface WidgetPlacement {
  corner: WidgetCorner;
  /** From the left or right edge, depending on the corner. */
  offsetX: number;
  /** From the top or bottom edge, depending on the corner. */
  offsetY: number;
  /**
   * Whether the widget may move itself when it finds the corner occupied.
   * On by default: a launcher covering a customer's support button is worse
   * than one that moved somewhere the operator did not pick. An operator who
   * has deliberately positioned it can turn this off so it stays put.
   */
  autoAvoid: boolean;
}

export const WIDGET_PLACEMENT_DEFAULT: WidgetPlacement = {
  corner: "bottom-right",
  offsetX: WIDGET_OFFSET_DEFAULT,
  offsetY: WIDGET_OFFSET_DEFAULT,
  autoAvoid: true,
};

function clampOffset(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return WIDGET_OFFSET_DEFAULT;
  return Math.min(WIDGET_OFFSET_MAX, Math.max(WIDGET_OFFSET_MIN, Math.round(n)));
}

/**
 * Coerce anything into a usable placement.
 *
 * Total by design: this runs on the boot path, which every page load of every
 * customer site hits. A malformed or half-migrated row must degrade to the
 * default placement, never to a thrown error that stops the widget rendering
 * at all. Validation that can refuse to answer is the wrong shape here.
 */
export function normalizeWidgetPlacement(input: unknown): WidgetPlacement {
  if (!input || typeof input !== "object") return { ...WIDGET_PLACEMENT_DEFAULT };
  const raw = input as Partial<Record<keyof WidgetPlacement, unknown>>;
  const corner = WIDGET_CORNERS.includes(raw.corner as WidgetCorner)
    ? (raw.corner as WidgetCorner)
    : WIDGET_PLACEMENT_DEFAULT.corner;
  return {
    corner,
    offsetX: clampOffset(raw.offsetX),
    offsetY: clampOffset(raw.offsetY),
    autoAvoid: raw.autoAvoid === undefined ? true : Boolean(raw.autoAvoid),
  };
}

/** True when the placement is the default — lets the UI say "default" instead
 *  of echoing coordinates nobody chose. */
export function isDefaultPlacement(p: WidgetPlacement): boolean {
  return (
    p.corner === WIDGET_PLACEMENT_DEFAULT.corner &&
    p.offsetX === WIDGET_PLACEMENT_DEFAULT.offsetX &&
    p.offsetY === WIDGET_PLACEMENT_DEFAULT.offsetY &&
    p.autoAvoid === WIDGET_PLACEMENT_DEFAULT.autoAvoid
  );
}
