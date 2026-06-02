#!/usr/bin/env node
// Pure-Node PNG generator for the Fleet Runner tray + window icon.
// Renders the FleetCrown "control window" mark (rounded rect + command bars).
// Output: desktop/resources/tray-icon.png (22x22) + tray-icon@2x.png (44x44).
//
// No external deps — uses zlib + crc32 to build a minimal RGBA PNG by hand.
// Re-run when the brand mark geometry changes (kept visually identical to
// public/icon.svg + BrandMark.tsx — see docs/branding-design.md).

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "resources");
mkdirSync(OUT_DIR, { recursive: true });

// CRC32 (per PNG spec).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typ = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typ, data])), 0);
  return Buffer.concat([len, typ, data, crc]);
}

// Pack an RGBA pixel buffer (width*height*4) into a valid PNG file.
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;       // bit depth
  ihdr[9] = 6;       // color type: RGBA
  ihdr[10] = 0;      // compression
  ihdr[11] = 0;      // filter
  ihdr[12] = 0;      // interlace
  // Scanlines prefixed by filter byte (0 = none).
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const dst = y * (1 + width * 4);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// Draw the control-window mark at the given size with super-sampling for AA.
// Geometry matches BrandMark.tsx + public/icon.svg: rounded rect (rx ~17% of
// the inner box) with a vertical center bar and two short horizontal whiskers.
// Light stroke on near-transparent dark background — works on both light + dark
// system trays (most OSes recolor monochrome tray icons anyway).
function renderMark(size) {
  const SS = 4;                                 // 4x super-sample for AA
  const W = size * SS, H = size * SS;
  const buf = Buffer.alloc(W * H * 4, 0);       // transparent

  // Inner geometry in supersampled px.
  const pad = Math.round(W * 0.18);
  const x0 = pad,   y0 = pad;
  const x1 = W - pad, y1 = H - pad;
  const rectW = x1 - x0, rectH = y1 - y0;
  const rx = Math.round(rectW * 0.22);
  const stroke = Math.max(2, Math.round(W * 0.07));

  // Anti-aliased rounded-rect-outline test: returns 1.0 inside ring, 0.0 outside.
  function ringAt(px, py) {
    // Distance to the rounded rectangle boundary (signed: negative inside).
    const cx = Math.max(x0 + rx, Math.min(px, x1 - rx));
    const cy = Math.max(y0 + rx, Math.min(py, y1 - rx));
    const dx = px - cx, dy = py - cy;
    const d = Math.hypot(dx, dy) - rx;          // signed distance to corner arcs
    // For straight edges the above formula already collapses to |perp distance| - rx
    // because dx or dy is zero. We add an additional check for straight sides:
    let dStraight;
    if (px < x0 + rx) dStraight = x0 - px;
    else if (px > x1 - rx) dStraight = px - x1;
    else if (py < y0 + rx) dStraight = y0 - py;
    else if (py > y1 - rx) dStraight = py - y1;
    else dStraight = -Math.min(px - x0, x1 - px, py - y0, y1 - py);
    const signed = (px >= x0 + rx && px <= x1 - rx) || (py >= y0 + rx && py <= y1 - rx)
      ? dStraight : d;
    // Ring of width `stroke` centered on signed=0.
    return Math.abs(signed) < stroke / 2 ? 1 : 0;
  }

  // Center vertical bar + two short horizontals (the "command bars").
  function barsAt(px, py) {
    const cx = (x0 + x1) / 2;
    const innerTop = y0 + Math.round(rectH * 0.15);
    const innerBot = y1 - Math.round(rectH * 0.15);
    // Vertical bar.
    if (Math.abs(px - cx) < stroke / 2 && py >= innerTop && py <= innerBot) return 1;
    // Two horizontals at mid-height: short stubs to either side of center.
    const cy = (y0 + y1) / 2;
    const stubLen = Math.round(rectW * 0.18);
    if (Math.abs(py - cy) < stroke / 2) {
      if (px >= cx - stubLen - stroke && px <= cx - stroke / 2) return 1;
      if (px >= cx + stroke / 2 && px <= cx + stubLen + stroke) return 1;
    }
    return 0;
  }

  // Render at supersampled resolution.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ring = ringAt(x, y);
      const bars = barsAt(x, y);
      const a = Math.max(ring, bars);
      if (a > 0) {
        const i = (y * W + x) * 4;
        // Off-white stroke (#ededed). Tray themes typically recolor monochrome icons.
        buf[i] = 0xed;
        buf[i + 1] = 0xed;
        buf[i + 2] = 0xed;
        buf[i + 3] = 255;
      }
    }
  }

  // Downsample SS×SS → 1× with box filter for AA.
  const out = Buffer.alloc(size * size * 4, 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
        }
      }
      const n = SS * SS;
      const j = (y * size + x) * 4;
      out[j]     = Math.round(r / n);
      out[j + 1] = Math.round(g / n);
      out[j + 2] = Math.round(b / n);
      out[j + 3] = Math.round(a / n);
    }
  }
  return out;
}

const sizes = [
  { name: "tray-icon.png",    size: 22 },
  { name: "tray-icon@2x.png", size: 44 },
  { name: "icon.png",         size: 256 },   // window + electron-builder icon
];

for (const { name, size } of sizes) {
  const rgba = renderMark(size);
  const png = encodePng(size, size, rgba);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`wrote ${name} (${size}x${size}, ${png.length} bytes)`);
}
