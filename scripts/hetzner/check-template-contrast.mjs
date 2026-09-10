#!/usr/bin/env node
/**
 * Compute the REAL WCAG contrast of the site-template's tokens, in both colour
 * schemes.
 *
 * WHY THIS IS ARITHMETIC AND NOT A GREP
 *
 * The first version of this check was a grep: "the dark block must override
 * --color-accent-fg and must NOT override --color-accent". That encoded one
 * palette's shape, not the property anyone cares about. The moment the template
 * adopted FleetCrown's monochrome action — near-black on light, near-white on
 * dark — the primary action began INVERTING between schemes, and the grep
 * called a correct palette broken.
 *
 * A rule that describes the shape of today's colours has to be rewritten every
 * time the colours change, and each rewrite is a chance to encode the next
 * wrong thing. The property that never changes is the ratio. So compute it.
 *
 * It caught a real defect before either version existed: one --color-accent
 * used as both a button surface and as body text is 5.1:1 as a button and
 * 3.7:1 as text on the dark ground, and neither failure is visible in a build,
 * a lint, or a screenshot.
 *
 * oklch, because that is what FleetCrown uses and what the template now
 * mirrors. Conversion is oklch -> OKLab -> linear sRGB, and WCAG luminance is
 * taken from the LINEAR values directly (gamma-encoding and decoding again
 * would only add rounding).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = join(HERE, "../site-template/app/globals.css");

const AA = 4.5; // normal-size text
const AA_UI = 3.0; // a status dot is a UI component, not text

function oklchToLinearSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  // Clamp: a token can name a colour outside the sRGB gamut, and a negative
  // channel would otherwise produce a luminance that no screen can show.
  const clamp = (x) => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function luminance(value) {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`not an oklch value: ${value}`);
  const [r, g, b] = oklchToLinearSrgb(Number(m[1]), Number(m[2]), Number(m[3]));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// ── read the two schemes ─────────────────────────────────────────────────────
// Everything before the dark media query is the light scheme; the media block
// overrides it. Deliberately simple, and asserted below: if the split ever
// stops finding a dark block, that is a failure, not a silent pass.
const src = readFileSync(CSS, "utf8");
const marker = "@media (prefers-color-scheme: dark)";
const cut = src.indexOf(marker);
if (cut === -1) {
  console.error("✗ globals.css has no dark scheme block — half the checks would be vacuous");
  process.exit(1);
}

function declarations(text) {
  const out = new Map();
  for (const [, name, value] of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out.set(name, value.trim());
  }
  return out;
}

const light = declarations(src.slice(0, cut));
const dark = new Map([...light, ...declarations(src.slice(cut))]);

// Resolve var() chains so a semantic token pointing at a primitive still
// resolves to a colour rather than to the string "var(--primitive-ink-950)".
function resolve(map, name, depth = 0) {
  const raw = map.get(name);
  if (raw === undefined) throw new Error(`token not defined: ${name}`);
  if (depth > 10) throw new Error(`var() cycle at ${name}`);
  const ref = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
  return ref ? resolve(map, ref[1], depth + 1) : raw;
}

const PAIRS = [
  ["body text", "--color-fg-primary", "--color-surface-page", AA],
  ["secondary text", "--color-fg-secondary", "--color-surface-page", AA],
  ["muted text", "--color-fg-muted", "--color-surface-page", AA],
  ["text on raised", "--color-fg-secondary", "--color-surface-raised", AA],
  ["action label", "--color-accent-contrast", "--color-accent", AA],
  ["accent as text", "--color-accent-fg", "--color-surface-page", AA],
  ["live dot", "--color-signal-live", "--color-surface-page", AA_UI],
];

let failed = 0;
for (const [scheme, map] of [
  ["light", light],
  ["dark", dark],
]) {
  console.log(`\n  ${scheme}`);
  for (const [label, fg, bg, floor] of PAIRS) {
    const r = ratio(resolve(map, fg), resolve(map, bg));
    const ok = r >= floor;
    if (!ok) failed++;
    console.log(
      `    ${ok ? "✓" : "✗"} ${label.padEnd(16)} ${r.toFixed(2)}:1  (needs ${floor.toFixed(1)})`,
    );
  }
}

// ── the check must still be able to fail ─────────────────────────────────────
// Absence-shaped checks pass exactly as quietly when their arithmetic rots.
// Prove the maths on a pair whose answer is known: white on white is 1:1.
const selfCheck = ratio("oklch(1 0 0)", "oklch(1 0 0)");
if (Math.abs(selfCheck - 1) > 0.01) {
  console.error(
    `\n✗ contrast maths is wrong: white on white computed as ${selfCheck.toFixed(2)}:1`,
  );
  process.exit(1);
}
const blackOnWhite = ratio("oklch(0 0 0)", "oklch(1 0 0)");
if (blackOnWhite < 20) {
  console.error(
    `\n✗ contrast maths is wrong: black on white computed as ${blackOnWhite.toFixed(2)}:1`,
  );
  process.exit(1);
}

if (failed > 0) {
  console.error(`\n✗ ${failed} token pair(s) below AA.`);
  console.error("  This ships into every site made from this scaffold, in a scheme");
  console.error("  roughly half of visitors use, and it is invisible in a screenshot.");
  process.exit(1);
}
console.log("\n✓ every token pair meets AA in both schemes");
