// The widget's theme is DERIVED from @bitbaum/design-tokens, never typed.
// This fails when the committed generated file no longer matches the tokens
// (someone bumped the package or edited the generated file by hand), and it
// pins the conversion so a wrong HSL→hex cannot ship a wrong colour.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cssColorToConcrete, buildWidgetTheme, generate } from "../generate-widget-theme";
import { PALETTE } from "../../src/lib/palette";
import { WIDGET_THEME } from "../../src/lib/widget-theme.generated";

// conversion
assert.equal(cssColorToConcrete("0 0% 4%"), "#0a0a0a");
assert.equal(cssColorToConcrete("0 0% 100%"), "#ffffff");
assert.equal(cssColorToConcrete("#FF5C00"), "#ff5c00");
assert.equal(cssColorToConcrete("0 75% 60%"), "#e64c4c");
assert.equal(cssColorToConcrete("0 75% 60% / 0.12"), "rgba(230,76,76,0.12)");

// a tiny tokens file is enough to prove the mapping picks the right block
const tiny = `:root {\n  --public-accent: #ff5c00;\n  --on-accent: 0 0% 8%;\n  --surface-public: 0 0% 4%;\n  --radius-control: 0.375rem;\n  --radius-surface: 0.5rem;\n  --font-sans: 'Inter', system-ui, sans-serif;\n  --font-mono: 'IBM Plex Mono', monospace;\n  --text-primary: 0 0% 10%;\n}\n.dark {\n  --accent-hover: #ff7a33;\n  --text-primary: 0 0% 92%;\n  --text-secondary: 0 0% 65%;\n  --text-tertiary: 0 0% 48%;\n  --text-muted: 0 0% 32%;\n  --surface-page: 0 0% 7%;\n  --surface-hover: 0 0% 13%;\n  --border-subtle: 0 0% 13%;\n  --border-default: 0 0% 20%;\n  --border-strong: 0 0% 24%;\n  --status-positive: 145 55% 50%;\n  --status-negative: 0 75% 60%;\n  --status-negative-subtle: 0 75% 60% / 0.12;\n}\n`;
const t = buildWidgetTheme(tiny);
assert.equal(t.text, "#ebebeb", "dark text, not the light block's #1a1a1a");
assert.equal(t.surface, "#0a0a0a");
assert.equal(t.inkOnAccent, "#141414");
assert.equal(t.accentMuted, "rgba(255,92,0,0.16)");
assert.equal(t.radiusSurface, "8px");
assert.ok(t.fontSans.startsWith("'Inter'"));

// the committed file is what the tokens produce today
const committed = readFileSync(join(process.cwd(), "src/lib/widget-theme.generated.ts"), "utf8");
assert.equal(committed, generate(), "src/lib/widget-theme.generated.ts is stale — regenerate");

// and it is what the server ships to every widget
assert.deepEqual(
  PALETTE.widget,
  WIDGET_THEME,
  "PALETTE.widget must be the generated theme, not a hand copy",
);

console.log("widget-theme-from-tokens: ok");
