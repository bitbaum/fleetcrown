#!/usr/bin/env node
// Brand icons are generated from the single SSOT (src/config/brand-mark.ts) by
// the repo-root script `npm run generate:brand`, which writes the dense-coil
// spiral straight into desktop/resources/ (icon.png, tray-icon.png,
// tray-icon@2x.png) where they are committed. This step used to hand-draw a
// DIFFERENT glyph (a "control-window" rect) — the source of the alien tray
// icon — so it now only verifies the committed assets exist and fails loudly
// with the fix if they don't. Never redraw the mark here.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RES = join(__dirname, "..", "resources");
const required = ["icon.png", "tray-icon.png", "tray-icon@2x.png"];

const missing = required.filter((f) => !existsSync(join(RES, f)));
if (missing.length) {
  console.error(
    `[brand] missing desktop icons: ${missing.join(", ")}\n` +
      `        Run \`npm run generate:brand\` at the repo root to regenerate them ` +
      `from src/config/brand-mark.ts, then commit desktop/resources/.`,
  );
  process.exit(1);
}
console.log(`[brand] desktop icons present (${required.join(", ")}) — from SSOT`);
