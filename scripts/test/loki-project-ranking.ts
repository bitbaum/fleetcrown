/**
 * The project the operator NAMED must survive the slice.
 *
 * Production: asked "what do you think about heidi", Loki answered about two
 * contacts named Heidi and never mentioned the `Heidi` PROJECT — which is
 * registered. The people source searched by message; the project source did
 * not. It returned projects in table order and the caller head-sliced to a
 * limit, so with ~30 registered projects the one being asked about simply fell
 * off the end.
 *
 * No prompt rule can recover a record that was never retrieved, which is why
 * this is tested at the retrieval layer rather than left to the contract.
 *
 * Pure: no database, no model.
 */
import { rankProjectsByMessage } from "@/lib/agent/project-ranking";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}\n      expected: ${e}\n      actual:   ${a}`);
    failures++;
  }
}

const names = (rows: Array<{ name: string }>) => rows.map((r) => r.name);
const projects = [
  "aoz-housing",
  "BiasLens",
  "botsmann",
  "datacat",
  "evig",
  "fleetcrown",
  "HamsterCheek",
  "ivy-portal",
  "orangecat",
  "Heidi",
].map((name) => ({ name }));

console.log("loki project ranking");

check(
  "the named project is ranked first, so a slice cannot drop it",
  names(rankProjectsByMessage(projects, "what do you think about heidi")).slice(0, 1),
  ["Heidi"],
);

check(
  "matching is case-insensitive",
  names(rankProjectsByMessage(projects, "HEIDI status?")).slice(0, 1),
  ["Heidi"],
);

check(
  "a slug is found when typed with a space",
  names(rankProjectsByMessage(projects, "how is aoz housing doing")).slice(0, 1),
  ["aoz-housing"],
);

check(
  "a slug part is enough — 'aoz' finds aoz-housing",
  names(rankProjectsByMessage(projects, "anything new on aoz?")).slice(0, 1),
  ["aoz-housing"],
);

check(
  "several named projects all come first, original order among them kept",
  names(rankProjectsByMessage(projects, "compare evig and datacat")).slice(0, 2),
  ["datacat", "evig"],
);

check(
  "a message naming nothing leaves the order untouched",
  names(rankProjectsByMessage(projects, "what needs my attention today")),
  names(projects),
);

// Guard against the obvious false positive: a two-letter project name must not
// match every word that happens to contain it.
check(
  "names under three characters never match",
  names(rankProjectsByMessage([{ name: "ai" }, { name: "datacat" }], "said it again")).slice(0, 1),
  ["ai"],
);

check(
  "no project is lost or duplicated by ranking",
  names(rankProjectsByMessage(projects, "heidi and evig")).slice().sort(),
  names(projects).slice().sort(),
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("✓ loki project ranking: all checks passed");
