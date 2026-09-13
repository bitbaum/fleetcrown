// The terminal pane says WHERE a shell is running. This pins the shortening,
// because the first version of it was wrong in the worst available way.
//
// It truncated from the left using CSS `direction: rtl`, which moves the
// leading separator to the far end: `/home/g` rendered on the page as
// `home/g/`. A shortened path is fine. A path that is a DIFFERENT path is not
// — it is the one string on that row an operator might act on, and there is no
// hint on screen that it has been rearranged. So the shortening happens in
// code, where the output is a real string that can be asserted.
// Run: npx tsx scripts/test/terminal-pane-where.ts
import { shortPath } from "@/lib/terminal-path";

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
const eq = (got: string, want: string, label: string) => {
  ok(got === want, `${label} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

// The regression, stated first: a leading slash stays leading.
eq(shortPath("/home/g", "/home/g"), "~", "the home directory itself is ~");
ok(
  !shortPath("/var/www", undefined).endsWith("/"),
  "a path never ends up with a trailing separator",
);
ok(shortPath("/var/www", undefined).startsWith("/"), "an absolute path stays absolute");

// Home collapsing — only when it really is home, never on a prefix collision.
eq(
  shortPath("/home/g/dev/fleetcrown", "/home/g"),
  "~/dev/fleetcrown",
  "under home: ~ makes it short enough to keep whole",
);
eq(
  shortPath("/home/g/dev/fleetcrown/src/app", "/home/g"),
  "…/src/app",
  "under home, still long: last two segments",
);
eq(shortPath("/home/g/dev", "/home/g"), "~/dev", "under home, shallow: kept whole");
// The prefix-collision case: /home/greg must NOT become ~reg/dev.
const collision = shortPath("/home/greg/dev", "/home/g");
ok(
  !collision.startsWith("~"),
  "a path that merely SHARES a prefix with home is never collapsed to ~",
);
eq(collision, "/home/greg/dev", "and it is returned intact");
eq(shortPath("/home/g", undefined), "/home/g", "with no home known, nothing is collapsed");

// Long absolute paths keep the end, which is the part that identifies the work.
eq(
  shortPath("/opt/fleetcrown/releases/20260913-5930415/app", undefined),
  "…/20260913-5930415/app",
  "a long path keeps its last two segments",
);
eq(shortPath("/var", undefined), "/var", "a short path is returned unchanged");
eq(shortPath("/", undefined), "/", "the root path survives");

// Whatever it returns must be usable as a label: no empties, no stray markers.
for (const p of ["/", "/var", "/home/g", "/home/g/dev/fleetcrown", "/a/b/c/d/e"]) {
  const out = shortPath(p, "/home/g");
  ok(out.length > 0, `never empty for ${p}`);
  ok(!out.includes("//"), `no doubled separator for ${p}`);
}

console.log(`terminal-pane-where: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
