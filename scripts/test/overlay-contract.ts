/**
 * Every dialog must be closable with the keyboard.
 *
 * This is the third time the same defect shipped. The command palette carries a
 * comment about fixing "the user's 'Escape doesn't close' complaint"; the mobile
 * navigation sheet was found in production with Escape doing nothing and the
 * page still scrolling behind it; the floating Loki assistant could be OPENED
 * with a key (`?`) and not closed with one.
 *
 * The cause is structural, not careless: `useEscapeToClose` lived as a private
 * helper inside `components/ui/modal.tsx`, so the behaviour was only available
 * to anything using <Modal>/<Drawer>. Every hand-rolled overlay started from
 * zero and had to remember. Some did. Three did not.
 *
 * So the hook moved to `hooks/use-escape-to-close.ts` and this check makes the
 * requirement enforceable: anything that claims `role="dialog"` must handle
 * Escape. Fixing the fourth instance by hand would cost more than this file.
 *
 * Structural on purpose — it reads source text, so it runs in `test:unit` with
 * no database, no browser and no server.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

check("every role=\"dialog\" overlay closes on Escape", () => {
  const files = walk(join(root, "src"));
  const offenders: string[] = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!/role="dialog"/.test(src)) continue;
    // Either the shared hook, or a hand-written Escape listener. The point is
    // the behaviour existing, not which spelling was used.
    const handlesEscape = /useEscapeToClose|["']Escape["']/.test(src);
    if (!handlesEscape) offenders.push(file.replace(`${root}/`, ""));
  }

  assert(
    offenders.length === 0,
    `dialog(s) with no Escape handling: ${offenders.join(", ")}\n` +
      "  Import useEscapeToClose from @/hooks/use-escape-to-close.",
  );
});

check("the Escape hook is shared, not private to one component", () => {
  // The whole reason three overlays missed it: the helper was unreachable.
  const hook = join(root, "src/hooks/use-escape-to-close.ts");
  const src = readFileSync(hook, "utf8");
  assert(/export function useEscapeToClose/.test(src), "useEscapeToClose must be exported from hooks/");

  const modal = readFileSync(join(root, "src/components/ui/modal.tsx"), "utf8");
  assert(
    /from "@\/hooks\/use-escape-to-close"/.test(modal),
    "modal.tsx must consume the shared hook — a second copy is how the first one drifted",
  );
  assert(
    !/function useEscapeToClose/.test(modal),
    "modal.tsx must not define its own useEscapeToClose",
  );
});

check("full-screen overlays lock the page behind them", () => {
  // A sheet/drawer that covers the app while the page keeps scrolling behind it
  // is the mobile version of the same bug: the user's gesture goes somewhere
  // they cannot see. Scoped to the shell overlays that actually cover the app.
  const covering = [
    "src/components/shell/MobileNavSheet.tsx",
    "src/components/shell/SessionsDrawer.tsx",
    "src/components/shell/CommandPalette.tsx",
  ];
  for (const rel of covering) {
    const src = readFileSync(join(root, rel), "utf8");
    assert(
      /useOverlayLock/.test(src),
      `${rel} covers the app but does not call useOverlayLock — the page will scroll behind it`,
    );
  }
});

console.log(`\n${passed}/${passed} passed`);
