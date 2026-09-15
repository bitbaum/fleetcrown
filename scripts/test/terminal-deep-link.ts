// A "Watch" link has to land on the thing it offered to show.
//
// The defect this pins, measured 2026-09-13: dispatching a prompt to a project
// from Control produced a "Queued — waiting for a builder" banner with a Watch
// link. Clicking it opened /terminal?project=<key> with no source, so the
// source fell back to the one REMEMBERED IN LOCALSTORAGE — Shell — and the
// reader landed on an unrelated bash PTY showing a week-old panic message. The
// agent ran the whole time. Nothing errored; the page just opened elsewhere,
// and it did so for every watch link in that browser, permanently.
// Run: npx tsx scripts/test/terminal-deep-link.ts
import { resolveTerminalSource } from "@/lib/terminal-deep-link";
import type { TerminalSource } from "@/config/terminal-modes";

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
const eq = (got: string, want: string, label: string) =>
  ok(got === want, `${label} — got ${got}, want ${want}`);

const LOCAL: readonly TerminalSource[] = ["cloud", "machine", "shell"];
const HOSTED: readonly TerminalSource[] = ["cloud", "machine"];

// ── the regression ──────────────────────────────────────────────────────────
eq(
  resolveTerminalSource({
    remembered: "shell",
    projectRequested: true,
    available: LOCAL,
  }),
  "cloud",
  "a project link never opens the shell just because shell was remembered",
);

// ── and the other direction: nothing else is disturbed ──────────────────────
eq(
  resolveTerminalSource({ remembered: "shell", projectRequested: false, available: LOCAL }),
  "shell",
  "opening /terminal with NO project still honours the remembered shell",
);
eq(
  resolveTerminalSource({
    fromUrl: "shell",
    remembered: "cloud",
    projectRequested: true,
    available: LOCAL,
  }),
  "shell",
  "an EXPLICIT ?source=shell is obeyed even with a project — that is the reader asking",
);
eq(
  resolveTerminalSource({ remembered: "machine", projectRequested: true, available: LOCAL }),
  "machine",
  "a remembered agent source survives a project link",
);
eq(
  resolveTerminalSource({ remembered: "cloud", projectRequested: true, available: LOCAL }),
  "cloud",
  "cloud survives a project link",
);
eq(
  resolveTerminalSource({
    fromUrl: "machine",
    remembered: "cloud",
    projectRequested: true,
    available: LOCAL,
  }),
  "machine",
  "an explicit source always wins over the remembered one",
);

// ── deployments that cannot offer a shell at all ────────────────────────────
eq(
  resolveTerminalSource({ remembered: "shell", projectRequested: true, available: HOSTED }),
  "cloud",
  "on a hosted plane with no shell, a project link still resolves to an agent source",
);

// ── degenerate input must not produce something unusable ────────────────────
eq(
  resolveTerminalSource({ remembered: "shell", projectRequested: true, available: ["shell"] }),
  "shell",
  "if shell is the ONLY source, it is returned rather than nothing",
);

console.log(`terminal-deep-link: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
