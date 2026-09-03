/**
 * Where the launcher sits, and how it gets out of the way.
 *
 * Every mainstream chat widget parks itself bottom-right, and so did we — with
 * a z-index near the 32-bit maximum, which meant we usually won and covered
 * *their* button. This module is the answer to "get off my support widget".
 *
 * Kept separate from main.ts because the interesting parts (which corner, how
 * far to step aside, does this rectangle overlap ours) are pure geometry and
 * can be tested without a browser. Only `probeCorner` touches the DOM.
 */

export const CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;
export type Corner = (typeof CORNERS)[number];

export interface Placement {
  corner: Corner;
  offsetX: number;
  offsetY: number;
  autoAvoid: boolean;
}

export const DEFAULT_PLACEMENT: Placement = {
  corner: "bottom-right",
  offsetX: 16,
  offsetY: 16,
  autoAvoid: true,
};

/** Gap left between our launcher and whatever we stepped around. Big enough
 *  that the two read as separate controls rather than one odd stack. */
export const AVOID_GAP = 12;

/** Give up rather than climb the whole viewport. Past this we are no longer
 *  "in the corner" in any meaningful sense, and something on the page is
 *  unusual enough that the visitor's own move/hide is the better answer. */
export const MAX_AVOID_SHIFT = 260;

/** Anything at least this big in the corner is a real control, not a stray
 *  pixel or a tracking iframe. Chat launchers are 48–64px. */
const MIN_FOREIGN_SIZE = 24;

/**
 * CSS edge properties for a corner. Returned rather than branched at the call
 * site so main.ts never re-derives which edges a corner implies — that was
 * where an earlier version put `bottom` on a top-anchored launcher.
 */
export function cornerEdges(corner: Corner): { x: "left" | "right"; y: "top" | "bottom" } {
  return {
    x: corner.endsWith("left") ? "left" : "right",
    y: corner.startsWith("top") ? "top" : "bottom",
  };
}

/** Coerce whatever boot returned into a usable placement. Total: a bad value
 *  must never stop the widget rendering. Mirrors normalizeWidgetPlacement in
 *  src/config/widget-placement.ts — the server's copy is authoritative, this
 *  one exists because the widget cannot import from src/. */
export function normalizePlacement(input: unknown): Placement {
  if (!input || typeof input !== "object") return { ...DEFAULT_PLACEMENT };
  const raw = input as Record<string, unknown>;
  const corner = (CORNERS as readonly string[]).includes(raw.corner as string)
    ? (raw.corner as Corner)
    : DEFAULT_PLACEMENT.corner;
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.min(240, Math.max(0, Math.round(n))) : fallback;
  };
  return {
    corner,
    offsetX: num(raw.offsetX, DEFAULT_PLACEMENT.offsetX),
    offsetY: num(raw.offsetY, DEFAULT_PLACEMENT.offsetY),
    autoAvoid: raw.autoAvoid === undefined ? true : Boolean(raw.autoAvoid),
  };
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Do two rectangles overlap at all? Touching edges do not count. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * How much further from its anchored edge the launcher must sit to clear
 * everything it collides with.
 *
 * Always moves along the Y axis. Sideways would slide the launcher across the
 * bottom of the page, where it collides with cookie bars and looks misplaced;
 * stacking vertically is what a person expects of two corner buttons and is
 * what every chat vendor's own "offset" setting does.
 *
 * Returns the new offsetY, or the original when nothing is in the way.
 */
export function avoidOffsetY(
  own: Rect,
  foreign: Rect[],
  corner: Corner,
  currentOffsetY: number,
): number {
  const anchoredTop = corner.startsWith("top");
  let offset = currentOffsetY;
  let box = { ...own };

  // Re-check after each shift: stepping over one launcher can land on another
  // (a site running chat + cookie consent + a back-to-top button). Bounded by
  // the list length, so no unbounded loop even if rectangles are pathological.
  for (let i = 0; i < foreign.length + 1; i++) {
    // Test against a box inflated by the gap, not the bare one. Strict overlap
    // alone lets a shift land the launcher exactly flush against the next
    // obstacle — technically not covering it, visually one indistinguishable
    // blob of buttons. The gap is the point, so it has to be part of the test.
    const probe = { ...box, top: box.top - AVOID_GAP, bottom: box.bottom + AVOID_GAP };
    const hit = foreign.find((f) => overlaps(probe, f));
    if (!hit) break;
    const shift = (anchoredTop ? hit.bottom - box.top : box.bottom - hit.top) + AVOID_GAP;
    if (shift <= 0) break;
    const next = offset + shift;
    if (next - currentOffsetY > MAX_AVOID_SHIFT) return currentOffsetY;
    offset = next;
    box = anchoredTop
      ? { ...box, top: box.top + shift, bottom: box.bottom + shift }
      : { ...box, top: box.top - shift, bottom: box.bottom - shift };
  }
  return offset;
}

/**
 * Foreign fixed/sticky elements sharing our corner.
 *
 * `ownHost` is excluded by identity rather than by class name, because our own
 * shadow host is a plain div on the customer's page and a name-based check
 * would be defeated by any site that happens to use the same class.
 *
 * Elements are read from the document only — we deliberately do NOT descend
 * into other sites' shadow roots. A closed shadow root cannot be read anyway,
 * and an open one belongs to somebody else's component; the host rectangle is
 * what actually occupies the space, which is all we need.
 */
export function probeCorner(ownHost: Element, ownRect: Rect): Rect[] {
  const found: Rect[] = [];
  const seen = new Set<Element>();
  const all = document.body ? document.body.querySelectorAll<HTMLElement>("*") : [];
  for (const el of Array.from(all)) {
    if (el === ownHost || ownHost.contains(el) || seen.has(el)) continue;
    let cs: CSSStyleDeclaration;
    try {
      cs = getComputedStyle(el);
    } catch {
      continue;
    }
    if (cs.position !== "fixed" && cs.position !== "sticky") continue;
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < MIN_FOREIGN_SIZE || r.height < MIN_FOREIGN_SIZE) continue;
    // A full-width bar (nav, cookie banner spanning the page) is not something
    // we can step around usefully — moving up just lands on the next one, and
    // the visitor can still reach a launcher that overlaps a banner edge.
    if (r.width > window.innerWidth * 0.9) continue;
    const rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    if (!overlaps(ownRect, rect)) continue;
    seen.add(el);
    found.push(rect);
  }
  return found;
}
