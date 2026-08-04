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

// icons/ is the Linux installer icon set (build.linux.icon points at it). Each
// size becomes a /usr/share/icons/hicolor/<size>x<size>/apps entry in the .deb;
// if the directory is missing, electron-builder silently falls back to a single
// oversized icon and the launcher renders blank on KDE/GNOME.
const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const required = [
  "icon.png",
  "tray-icon.png",
  "tray-icon@2x.png",
  ...ICON_SIZES.map((s) => `icons/${s}x${s}.png`),
];

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
