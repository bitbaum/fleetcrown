/**
 * Unit test for Loki's fleet index (buildFleetIndex) — the BREADTH half of
 * Loki's project awareness. Pure function, no DB, so it runs in the env-
 * independent unit suite. The RAG/DEPTH half (buildLokiFleetContext) needs a
 * live DB + embeddings and is exercised by the prod Loki dogfood instead.
 */
import assert from "node:assert/strict";
import { buildFleetIndex } from "../../src/lib/loki-fleet-index";
import type { UserProject, DevLogEntry } from "../../src/db/schema/user-projects";

function project(partial: Partial<UserProject>): UserProject {
  return {
    id: "p", userId: "u", name: "proj", description: null, stack: null,
    isActive: true, devLog: [] as DevLogEntry[],
    // remaining columns are irrelevant to the index; cast through unknown.
    ...partial,
  } as unknown as UserProject;
}

// Empty fleet → empty string (nothing to inject).
assert.equal(buildFleetIndex([]), "", "empty fleet → empty string");

// A populated fleet leads with a count header and one line per project.
const out = buildFleetIndex([
  project({ name: "BiasLens", stack: "Next.js", description: "Detect media bias", devLog: [{ date: "2026-07-01", done: "shipped ingest", next: "UI" } as DevLogEntry] }),
  project({ name: "orangecat", description: "Bitcoin-native funding" }),
]);
assert.match(out, /Your projects \(2 active\)/, "header shows active count");
assert.match(out, /\*\*BiasLens\*\*/, "project name is bolded");
assert.match(out, /Next\.js/, "stack is included when present");
assert.match(out, /Detect media bias/, "description is included");
assert.match(out, /latest: 2026-07-01: shipped ingest/, "latest dev-log state is surfaced");
assert.match(out, /\*\*orangecat\*\*/, "second project present");
assert.ok(!/undefined|null/.test(out), "no undefined/null leaks for missing fields");

// The import placeholder description is filtered (cleanDescription) — not echoed.
const placeholder = buildFleetIndex([
  project({ name: "ghost", description: "Local repository imported from fleetcrown-ui" }),
]);
assert.ok(!/Local repository imported/.test(placeholder), "placeholder description is suppressed");

console.log("✓ loki-fleet-context (buildFleetIndex) tests passed");
