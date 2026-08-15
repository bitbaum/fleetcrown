// The browser terminal is the one surface where a VIEWER resizes the SOURCE OF
// TRUTH — its measurements are applied to the live PTY an agent is working in.
// These cases pin the rule that a collapsed or transient viewport can never
// shrink that session (src/lib/terminal-viewport.ts).
// Run: npx tsx scripts/test/terminal-viewport.ts
import {
  ptyResizeToPublish,
  clampPtyGeometry,
  TERMINAL_MIN_COLS,
  TERMINAL_MIN_ROWS,
} from "@/lib/terminal-viewport";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.error(`✗ ${label}: expected ${e}, got ${a}`); }
}

// --- what the viewer publishes ------------------------------------------------

// The observed prod payload: a short browser window measured one row, and the
// runner applied it to the real zellij tab.
eq(ptyResizeToPublish({ cols: 74, rows: 1 }, null), null, "1-row measurement is never published");
eq(ptyResizeToPublish({ cols: 8, rows: 20 }, null), null, "hair-thin width is never published");
eq(ptyResizeToPublish({ cols: 0, rows: 0 }, null), null, "unlaid-out host is never published");
eq(ptyResizeToPublish({ cols: NaN, rows: NaN }, null), null, "NaN measurement is never published");

// A real viewport publishes, including the smallest phone-sized one.
eq(ptyResizeToPublish({ cols: 152, rows: 20 }, null), { cols: 152, rows: 20 }, "desktop publishes");
eq(
  ptyResizeToPublish({ cols: TERMINAL_MIN_COLS, rows: TERMINAL_MIN_ROWS }, null),
  { cols: TERMINAL_MIN_COLS, rows: TERMINAL_MIN_ROWS },
  "exactly at the floor still publishes",
);

// ResizeObserver fires on every layout pass; each duplicate used to be a real
// POST that woke the runner to re-apply a size it already had.
eq(ptyResizeToPublish({ cols: 152, rows: 20 }, { cols: 152, rows: 20 }), null, "unchanged size stays silent");
eq(
  ptyResizeToPublish({ cols: 152, rows: 21 }, { cols: 152, rows: 20 }),
  { cols: 152, rows: 21 },
  "one row taller does publish",
);

// A collapse must not overwrite the last good size — the session keeps it.
eq(ptyResizeToPublish({ cols: 74, rows: 1 }, { cols: 152, rows: 20 }), null, "collapse after a good size stays silent");

// --- what the boundary accepts ------------------------------------------------

// The server floors independently: an old bundle or any other caller is bound
// by the same rule without importing the client's decision.
eq(clampPtyGeometry({ cols: 74, rows: 1 }), { cols: 74, rows: TERMINAL_MIN_ROWS, clamped: true }, "server floors rows");
eq(clampPtyGeometry({ cols: 3, rows: 40 }), { cols: TERMINAL_MIN_COLS, rows: 40, clamped: true }, "server floors cols");
eq(clampPtyGeometry({ cols: 152, rows: 20 }), { cols: 152, rows: 20, clamped: false }, "real size passes through untouched");
eq(
  clampPtyGeometry({ cols: TERMINAL_MIN_COLS, rows: TERMINAL_MIN_ROWS }),
  { cols: TERMINAL_MIN_COLS, rows: TERMINAL_MIN_ROWS, clamped: false },
  "at the floor is not a clamp",
);

// The two layers must agree in one direction: anything the client publishes
// must survive the server untouched, or the PTY would fight the viewer.
for (const geom of [
  { cols: TERMINAL_MIN_COLS, rows: TERMINAL_MIN_ROWS },
  { cols: 74, rows: 12 },
  { cols: 152, rows: 20 },
  { cols: 240, rows: 60 },
]) {
  const published = ptyResizeToPublish(geom, null);
  if (published) {
    eq(clampPtyGeometry(published).clamped, false, `client-published ${geom.cols}x${geom.rows} is never clamped`);
  }
}

console.log(`${pass}/${pass + fail} terminal-viewport cases passed`);
if (fail > 0) process.exit(1);
