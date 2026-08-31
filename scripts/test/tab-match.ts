// Verifies the project-key ↔ zellij-tab fuzzy matcher (src/lib/tab-match.ts).
// Run: npx tsx scripts/test/tab-match.ts
import { normalizeTabKey, findMatchingTab } from "@/lib/tab-match";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.error(
      `✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// normalize
eq(normalizeTabKey("revamp-it"), "revampit", "normalize hyphen");
eq(normalizeTabKey("AOZ Housing"), "aozhousing", "normalize space+case");
eq(normalizeTabKey("revamp_it"), "revampit", "normalize underscore");

const tabs = ["revamp-it", "OrangeCat", "Fleetcrown", "Tab #5", "AOZ Housing"];

// hyphen / case / space drift → matches, preserving live casing
eq(findMatchingTab("revampit", tabs), "revamp-it", "revampit → revamp-it");
eq(findMatchingTab("orangecat", tabs), "OrangeCat", "case-insensitive exact");
eq(findMatchingTab("aoz-housing", tabs), "AOZ Housing", "slug → spaced name");
eq(findMatchingTab("fleetcrown", tabs), "Fleetcrown", "lowercase → live casing");

// exact case-insensitive takes precedence over a normalized collision
eq(findMatchingTab("revamp-it", tabs), "revamp-it", "exact wins");

// genuinely absent → null (caller then creates the canonical tab)
eq(findMatchingTab("kivvi", tabs), null, "no match → null");
eq(findMatchingTab("petvity", tabs), null, "no match → null (2)");

console.log(`${pass}/${pass + fail} tab-match cases passed`);
if (fail > 0) process.exit(1);
