/**
 * The feedback widget's theme, derived from the fleet design tokens.
 *
 * The widget floats on other people's sites and cannot read our CSS
 * variables, so it needs concrete colour values — and for a while those were
 * typed by hand into src/lib/palette.ts, which is how it drifted into "does
 * not look like part of FleetCrown". Now the values are READ from
 * @bitbaum/design-tokens/tokens.css (the fleet's design SSOT — see
 * fleet/AGENTS.md "Design") and written to src/lib/widget-theme.generated.ts.
 * A test regenerates and compares, so a token change that was not
 * regenerated fails the build instead of shipping a stale widget.
 *
 *   npx tsx scripts/generate-widget-theme.ts          # write
 *   npx tsx scripts/generate-widget-theme.ts --check  # exit 1 if stale
 *
 * The widget is FleetCrown's PUBLIC surface (the near-black the marketing
 * pages sit on), so it takes --surface-public plus the `.dark` theme's text,
 * border and status scales. Fonts and radii come from the same file.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const TOKENS_CSS = require.resolve("@bitbaum/design-tokens/tokens.css");
const OUT = join(here, "..", "src", "lib", "widget-theme.generated.ts");

type Vars = Record<string, string>;

/** `:root { … }` and `.dark { … }` as flat maps of custom property → raw value. */
export function parseTokenBlocks(css: string): { root: Vars; dark: Vars } {
  const block = (selector: string): Vars => {
    const start = css.indexOf(`${selector} {`);
    if (start === -1) throw new Error(`tokens.css has no "${selector} {" block`);
    const end = css.indexOf("\n}", start);
    const body = css.slice(start, end);
    const vars: Vars = {};
    for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
    return vars;
  };
  return { root: block(":root"), dark: block(".dark") };
}

/** HSL triplet ("0 0% 4%", optionally "/ 0.12") → #rrggbb or rgba(); passes hex through. */
export function cssColorToConcrete(raw: string): string {
  const v = raw.trim();
  if (v.startsWith("#")) return v.toLowerCase();
  const m = v.match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+))?$/);
  if (!m) throw new Error(`unrecognised colour token: "${raw}"`);
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const a = m[4] === undefined ? null : Number(m[4]);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  const [r1, g1, b1] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to255 = (n: number) => Math.round((n + mm) * 255);
  const [r, g, b] = [to255(r1), to255(g1), to255(b1)];
  if (a !== null) return `rgba(${r},${g},${b},${a})`;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** #rrggbb + alpha → rgba() — for the accent halo, which the tokens do not name. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function remToPx(rem: string): string {
  const m = rem.trim().match(/^([\d.]+)rem$/);
  if (!m) return rem.trim();
  return `${Math.round(Number(m[1]) * 16)}px`;
}

export function buildWidgetTheme(css: string) {
  const { root, dark } = parseTokenBlocks(css);
  const need = (vars: Vars, key: string): string => {
    const v = vars[key];
    if (!v) throw new Error(`tokens.css is missing --${key}`);
    return v;
  };
  const accent = cssColorToConcrete(need(root, "public-accent"));
  return {
    // one warm accent: Send, focus, the selection halo
    accent,
    accentHover: cssColorToConcrete(need(dark, "accent-hover")),
    /** the accent over the dark surface — tokens name no such colour, so it is the accent at 16% */
    accentMuted: withAlpha(accent, 0.16),
    inkOnAccent: cssColorToConcrete(need(root, "on-accent")),
    text: cssColorToConcrete(need(dark, "text-primary")),
    textSecondary: cssColorToConcrete(need(dark, "text-secondary")),
    textTertiary: cssColorToConcrete(need(dark, "text-tertiary")),
    textMuted: cssColorToConcrete(need(dark, "text-muted")),
    /** --surface-public: the near-black FleetCrown's own pages sit on */
    surface: cssColorToConcrete(need(root, "surface-public")),
    surfaceRaised: cssColorToConcrete(need(dark, "surface-page")),
    surfaceSubtle: cssColorToConcrete(need(dark, "surface-hover")),
    border: cssColorToConcrete(need(dark, "border-subtle")),
    borderStrong: cssColorToConcrete(need(dark, "border-default")),
    borderDark: cssColorToConcrete(need(dark, "border-strong")),
    success: cssColorToConcrete(need(dark, "status-positive")),
    error: cssColorToConcrete(need(dark, "status-negative")),
    errorSurface: cssColorToConcrete(need(dark, "status-negative-subtle")),
    black: cssColorToConcrete(need(root, "surface-public")),
    white: "#ffffff",
    radiusControl: remToPx(need(root, "radius-control")),
    radiusSurface: remToPx(need(root, "radius-surface")),
    fontSans: need(root, "font-sans").replace(/\s+/g, " "),
    fontMono: need(root, "font-mono").replace(/\s+/g, " "),
  } as const;
}

export function renderModule(theme: ReturnType<typeof buildWidgetTheme>, version: string): string {
  const lines = Object.entries(theme)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
    .join("\n");
  return `// GENERATED by scripts/generate-widget-theme.ts from @bitbaum/design-tokens@${version}
// — do not edit; change the tokens and regenerate. scripts/test/widget-theme-from-tokens.ts
// fails when this file is stale.
export const WIDGET_THEME = {
${lines}
} as const;

export type WidgetThemeShape = typeof WIDGET_THEME;
`;
}

export function generate(): string {
  const css = readFileSync(TOKENS_CSS, "utf8");
  const pkg = JSON.parse(readFileSync(join(dirname(TOKENS_CSS), "package.json"), "utf8")) as {
    version: string;
  };
  return renderModule(buildWidgetTheme(css), pkg.version);
}

const invokedDirectly =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === require("node:path").resolve(process.argv[1]);
if (invokedDirectly) {
  const next = generate();
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (process.argv.includes("--check")) {
    if (current !== next) {
      console.error("widget theme is stale — run: npx tsx scripts/generate-widget-theme.ts");
      process.exit(1);
    }
    console.log("widget theme matches @bitbaum/design-tokens");
  } else if (current !== next) {
    writeFileSync(OUT, next);
    console.log(`wrote ${OUT}`);
  } else {
    console.log("widget theme unchanged");
  }
}
