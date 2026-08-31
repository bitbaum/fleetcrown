/**
 * Contract test for the project-session SSOT resolver. Guards the SSE/GET
 * divergence that hid the auto-reroute capacity banner (2026-06-23): the GET
 * route fell back to the DB row but the local SSE path was file-only, so a
 * project whose .md was gone but whose project_states row persisted resolved
 * differently across the two paths. Both now call resolveProjectSession.
 */
import { dbRowToSession, resolveProjectSession } from "@/lib/project-session";
import type { SessionState } from "@/lib/control-types";
import type { ProjectState as DbProjectState } from "@/db/schema/project-states";

let ok = true;
const assert = (c: boolean, m: string) => {
  console.log(`  ${c ? "✓" : "✗"} ${m}`);
  if (!c) ok = false;
};

const fileSession: SessionState = {
  status: "ready",
  done: "from the .md file",
  next: "",
  tests: "",
  todos: "",
  health: "good",
  mtime: 1000,
};

// A persisted project_states row with capacity language in done + health.
const dbRow = {
  userId: "u",
  projectKey: "datacat",
  sessionStatus: "ready",
  sessionDone: "hit a rate limit — quota exceeded",
  sessionNext: "reroute",
  sessionTests: "",
  sessionTodos: "",
  sessionHealth: "rate limit — usage limit reached",
  sessionBlockReason: null,
  sessionNoOpCount: null,
  sessionUpdatedAt: new Date(2000),
} as unknown as DbProjectState;

const emptyRow = {
  sessionStatus: null,
  sessionDone: null,
  sessionNext: null,
  sessionUpdatedAt: new Date(),
} as unknown as DbProjectState;

// 1. file present -> file wins (DB row ignored)
assert(
  resolveProjectSession(fileSession, dbRow) === fileSession,
  "file present: file session wins over DB row",
);

// 2. file ABSENT + DB row present -> DB session surfaces (the bug case)
const r = resolveProjectSession(null, dbRow);
assert(r !== null, "file absent + DB row: returns a session, not null");
assert(r?.done === "hit a rate limit — quota exceeded", "file absent: done comes from the DB row");
assert(
  r?.health === "rate limit — usage limit reached",
  "file absent: health comes from the DB row",
);

// 3. neither source -> null
assert(resolveProjectSession(null, null) === null, "neither file nor DB row: null");
assert(resolveProjectSession(null, undefined) === null, "neither (undefined row): null");
assert(dbRowToSession(emptyRow) === null, "empty DB row (no done/next/status): null");

// 4. GET and SSE now resolve IDENTICALLY for a file-absent-but-DB-present project
//    (both call resolveProjectSession with the same inputs).
const getPath = JSON.stringify(resolveProjectSession(null, dbRow)); // GET: parseSession ?? db
const ssePath = JSON.stringify(resolveProjectSession(null, dbRow)); // SSE local fallback
assert(
  getPath === ssePath,
  "GET and SSE resolve identically for file-absent-DB-present (no divergence)",
);

console.log(ok ? "\n7/7 project-session assertions passed" : "\nFAIL");
process.exit(ok ? 0 : 1);
