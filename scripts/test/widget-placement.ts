// The launcher must never cover somebody else's launcher.
//
// Every mainstream chat widget defaults to bottom-right, and so do we — with a
// near-maximum z-index, so we win and hide THEIR control. The avoid geometry is
// what stops that, and it runs on customer sites we cannot see, so it is pinned
// here rather than checked by eye once.
// Run: npx tsx scripts/test/widget-placement.ts
import {
  AVOID_GAP,
  MAX_AVOID_SHIFT,
  avoidOffsetY,
  cornerEdges,
  normalizePlacement,
  overlaps,
  DEFAULT_PLACEMENT,
  type Rect,
} from "../../widget/placement";
import {
  normalizeWidgetPlacement,
  WIDGET_PLACEMENT_DEFAULT,
  WIDGET_CORNERS,
} from "../../src/config/widget-placement";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

const rect = (left: number, top: number, w: number, h: number): Rect => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

// ---- overlaps ----
ok(overlaps(rect(0, 0, 10, 10), rect(5, 5, 10, 10)), "overlapping rects overlap");
ok(!overlaps(rect(0, 0, 10, 10), rect(20, 20, 5, 5)), "distant rects do not");
ok(
  !overlaps(rect(0, 0, 10, 10), rect(10, 0, 10, 10)),
  "touching edges do NOT count — a launcher flush beside another is fine",
);

// ---- cornerEdges ----
ok(
  cornerEdges("bottom-right").x === "right" && cornerEdges("bottom-right").y === "bottom",
  "bottom-right maps to right/bottom",
);
ok(
  cornerEdges("top-left").x === "left" && cornerEdges("top-left").y === "top",
  "top-left maps to left/top",
);
ok(
  cornerEdges("bottom-left").x === "left" && cornerEdges("bottom-left").y === "bottom",
  "bottom-left maps to left/bottom",
);
ok(
  cornerEdges("top-right").x === "right" && cornerEdges("top-right").y === "top",
  "top-right maps to right/top",
);

// ---- avoidOffsetY: the case this whole module exists for ----
// Viewport 900 tall. Our 48px launcher at bottom:16 occupies y 836..884.
// A chat launcher (60px at bottom:20) occupies y 820..880 — they overlap.
const own = rect(1376, 836, 48, 48);
const chat = rect(1360, 820, 60, 60);

ok(overlaps(own, chat), "fixture: the two launchers really do overlap");

const moved = avoidOffsetY(own, [chat], "bottom-right", 16);
ok(moved > 16, "a colliding chat launcher pushes ours up");
// own.bottom(884) - chat.top(820) + gap = 64 + 12 = 76
ok(
  moved === 16 + (own.bottom - chat.top) + AVOID_GAP,
  "shift clears the obstacle plus one gap, exactly",
);

// Verify the moved box genuinely no longer overlaps.
const shift = moved - 16;
const movedBox = { ...own, top: own.top - shift, bottom: own.bottom - shift };
ok(!overlaps(movedBox, chat), "after the shift the rectangles no longer overlap");

ok(avoidOffsetY(own, [], "bottom-right", 16) === 16, "nothing in the way changes nothing");
ok(
  avoidOffsetY(own, [rect(0, 0, 40, 40)], "bottom-right", 16) === 16,
  "a far-away fixed element is ignored",
);

// Stacking: two obstacles, the second only reachable after clearing the first.
const second = rect(1360, 700, 60, 60);
const stacked = avoidOffsetY(own, [chat, second], "bottom-right", 16);
ok(stacked > moved, "a second obstacle above the first pushes further still");
const s2 = stacked - 16;
const box2 = { ...own, top: own.top - s2, bottom: own.bottom - s2 };
ok(!overlaps(box2, chat) && !overlaps(box2, second), "clears BOTH obstacles");

// Runaway guard: an obstacle taller than the cap must not walk us off-screen.
const huge = rect(1360, 0, 60, 890);
ok(
  avoidOffsetY(own, [huge], "bottom-right", 16) === 16,
  "an obstacle needing more than MAX_AVOID_SHIFT is abandoned, not chased off-screen",
);
ok(MAX_AVOID_SHIFT > 0 && MAX_AVOID_SHIFT < 1000, "the cap is a sane magnitude");

// Top-anchored corners shift the other way.
const ownTop = rect(1376, 16, 48, 48);
const chatTop = rect(1360, 40, 60, 60);
const movedTop = avoidOffsetY(ownTop, [chatTop], "top-right", 16);
ok(movedTop > 16, "top-anchored launchers also step away");
const st = movedTop - 16;
const boxTop = { ...ownTop, top: ownTop.top + st, bottom: ownTop.bottom + st };
ok(!overlaps(boxTop, chatTop), "top-anchored shift moves DOWN and clears");

// ---- normalizePlacement: total, never throws ----
ok(normalizePlacement(null).corner === "bottom-right", "null falls back to the default corner");
ok(normalizePlacement(undefined).autoAvoid === true, "undefined keeps auto-avoid on");
ok(
  normalizePlacement({ corner: "nonsense" }).corner === "bottom-right",
  "an unknown corner falls back",
);
ok(normalizePlacement({ corner: "top-left" }).corner === "top-left", "a valid corner is kept");
ok(
  normalizePlacement({ offsetX: -50 }).offsetX === 0,
  "negative offsets clamp to 0, never off-screen",
);
ok(normalizePlacement({ offsetX: 99999 }).offsetX === 240, "huge offsets clamp to the max");
ok(normalizePlacement({ offsetY: "24" }).offsetY === 24, "numeric strings coerce");
ok(normalizePlacement({ offsetY: NaN }).offsetY === DEFAULT_PLACEMENT.offsetY, "NaN falls back");
ok(normalizePlacement({ autoAvoid: false }).autoAvoid === false, "auto-avoid can be turned off");

// ---- the two normalizers must agree ----
// The widget cannot import from src/, so the logic exists twice. If they drift,
// the dashboard preview stops matching where the launcher actually lands.
ok(
  WIDGET_PLACEMENT_DEFAULT.corner === DEFAULT_PLACEMENT.corner &&
    WIDGET_PLACEMENT_DEFAULT.offsetX === DEFAULT_PLACEMENT.offsetX &&
    WIDGET_PLACEMENT_DEFAULT.offsetY === DEFAULT_PLACEMENT.offsetY &&
    WIDGET_PLACEMENT_DEFAULT.autoAvoid === DEFAULT_PLACEMENT.autoAvoid,
  "server and widget defaults are identical",
);
for (const c of WIDGET_CORNERS) {
  ok(
    normalizeWidgetPlacement({ corner: c }).corner === normalizePlacement({ corner: c }).corner,
    `server and widget agree on corner "${c}"`,
  );
}
for (const bad of [{ offsetX: -1 }, { offsetX: 5000 }, { corner: "nope" }, {}, null]) {
  const a = normalizeWidgetPlacement(bad);
  const b = normalizePlacement(bad);
  ok(
    a.corner === b.corner && a.offsetX === b.offsetX && a.offsetY === b.offsetY,
    `server and widget agree on ${JSON.stringify(bad)}`,
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
