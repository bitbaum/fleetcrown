// SSOT for the FleetCrown brand mark — a dense Archimedean coil: a "trippy"
// spiral that pulls the eye inward toward infinity. EVERY rendered asset
// (favicon, desktop tray icon, desktop app icon, OpenGraph images, the in-app
// BrandMark) derives its geometry from `spiralPathD()` here. Never hand-redraw
// the spiral anywhere else — that was the old bug (3 divergent copies + a tray
// glyph that drew a different shape entirely).
//
// Regenerate the static raster/vector assets after changing any parameter:
//   npm run generate:brand

import { PALETTE } from "@/lib/palette";

export const BRAND_MARK = {
  /** Square viewBox edge. All coordinates below live in this space. */
  viewBox: 100,
  /** Full turns of the coil. Dense enough to read as a hypnotic spiral, sparse
   *  enough to survive a 16px favicon. */
  turns: 3.15,
  /** Radius where the coil begins, near the center (the "infinity" pull-in). */
  innerRadius: 1,
  /** Radius of the outermost turn. Leaves room for stroke width + AA padding
   *  inside the 100×100 box. */
  outerRadius: 43,
  /** Stroke width, in viewBox units. */
  strokeWidth: 6,
  /** Polyline samples per turn — higher is smoother. */
  samplesPerTurn: 160,
} as const;

export type BrandMarkParams = typeof BRAND_MARK;

/** Archimedean spiral (r = innerRadius + k·θ) as an SVG path `d` string,
 *  wound from the outer tail inward to the center so it reads as falling into
 *  the middle. Pure geometry — no styling. */
export function spiralPathD(opts: Partial<BrandMarkParams> = {}): string {
  const m = { ...BRAND_MARK, ...opts };
  const cx = m.viewBox / 2;
  const cy = m.viewBox / 2;
  const thetaMax = m.turns * 2 * Math.PI;
  const k = (m.outerRadius - m.innerRadius) / thetaMax;
  const steps = Math.max(2, Math.round(m.turns * m.samplesPerTurn));

  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const theta = thetaMax * (1 - t); // outer → inner
    const r = m.innerRadius + k * theta;
    const a = theta - Math.PI / 2; // start the outer tail near top
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d.trim();
}

/** Full standalone `<svg>` markup for the mark. Used by the asset generators
 *  (favicon/tray/app icon) and the OpenGraph routes. In React components,
 *  prefer rendering `spiralPathD()` inside a JSX <svg> so it can be animated /
 *  themed via currentColor. */
export function brandMarkSvg(
  opts: {
    size?: number;
    /** Stroke color. Defaults to the dark text-primary mirror
     *  (PALETTE.dark.textPrimary). Use "currentColor" for themable inline use. */
    stroke?: string;
    /** When set, draws a rounded-rect background behind the spiral (app icon /
     *  favicon). Omit for a transparent glyph (tray icon / inline mark). */
    background?: string;
    /** Background corner radius in viewBox units. */
    radius?: number;
    strokeWidth?: number;
    opacity?: number;
  } = {},
): string {
  const vb = BRAND_MARK.viewBox;
  const size = opts.size ?? vb;
  const stroke = opts.stroke ?? PALETTE.dark.textPrimary;
  const sw = opts.strokeWidth ?? BRAND_MARK.strokeWidth;
  const bg = opts.background
    ? `<rect width="${vb}" height="${vb}" rx="${opts.radius ?? 22}" fill="${opts.background}"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}">` +
    bg +
    `<path d="${spiralPathD()}" fill="none" stroke="${stroke}" stroke-width="${sw}" ` +
    `stroke-linecap="round" stroke-linejoin="round" opacity="${opts.opacity ?? 1}"/>` +
    `</svg>`
  );
}
