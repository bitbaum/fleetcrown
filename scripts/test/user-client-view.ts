// GET /api/me returned the user row verbatim, so every authenticated page load
// shipped `passwordHash` and `privateZonePinHash` to the browser. These cases
// pin the projection that stops it (src/lib/user-client-view.ts) — and, more
// importantly, pin it against the column added TOMORROW: the schema is the SSOT
// this test reads, so a new field fails the suite until it is classified.
// Run: npx tsx scripts/test/user-client-view.ts
import { getTableColumns } from "drizzle-orm";
import { users, type User } from "@/db/schema/users";
import { USER_CLIENT_FIELDS, USER_WITHHELD_FIELDS, toClientUser } from "@/lib/user-client-view";

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
function eq(actual: unknown, expected: unknown, label: string) {
  ok(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

const schemaColumns = Object.keys(getTableColumns(users)).sort();
const exposed = new Set<string>(USER_CLIENT_FIELDS);
const withheld = new Set<string>(Object.keys(USER_WITHHELD_FIELDS));

// --- exhaustiveness: every column is classified, exactly once ------------------

for (const column of schemaColumns) {
  const inExposed = exposed.has(column);
  const inWithheld = withheld.has(column);
  ok(
    inExposed !== inWithheld,
    inExposed && inWithheld
      ? `users.${column} is in BOTH lists — say which one`
      : `users.${column} is in NEITHER list — classify it as exposed or withheld in src/lib/user-client-view.ts`,
  );
}

// ...and neither list names a column that no longer exists.
const schemaSet = new Set(schemaColumns);
for (const field of [...exposed, ...withheld]) {
  ok(schemaSet.has(field), `"${field}" is classified but is not a column on users — stale entry`);
}

// Every withheld field carries the reason it can never be sent.
for (const [field, reason] of Object.entries(USER_WITHHELD_FIELDS)) {
  ok(
    typeof reason === "string" && reason.length > 20,
    `users.${field} is withheld without a stated reason`,
  );
}

// The two that started this. Named explicitly so a future "simplification" that
// re-exposes them fails here and not in a page response.
ok(withheld.has("passwordHash"), "passwordHash must never reach the client");
ok(withheld.has("privateZonePinHash"), "privateZonePinHash must never reach the client");

// --- the projection actually drops them ---------------------------------------

const row: User = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Test Person",
  email: "test@example.com",
  emailVerified: new Date("2026-01-01T00:00:00Z"),
  image: null,
  username: "testperson",
  passwordHash: "4f7d37130615776551e8af20f2749a19",
  isDefault: false,
  onboardedAt: null,
  orangecatActorId: null,
  plan: "free",
  planStatus: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  planExpiresAt: null,
  privateZonePinHash: "deadbeef.cafe",
  privateZonePinSetAt: new Date("2026-02-01T00:00:00Z"),
  fleetSettings: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const view = toClientUser(row);
const viewKeys = Object.keys(view).sort();

eq(viewKeys, [...USER_CLIENT_FIELDS].sort(), "projection returns exactly the exposed fields");
ok(!("passwordHash" in view), "projection drops passwordHash");
ok(!("privateZonePinHash" in view), "projection drops privateZonePinHash");

// The serialized response is what actually crosses the wire — assert on that,
// not just on the object, so a stray toJSON or getter cannot smuggle a field.
const wire = JSON.stringify(view);
ok(!wire.includes(row.passwordHash!), "serialized response does not contain the password hash");
ok(!wire.includes(row.privateZonePinHash!), "serialized response does not contain the PIN hash");

// What the app needs still survives — the smoke test asserts on id, Settings on
// name/username/plan, and the private-zone UI on whether a PIN was ever set.
eq(view.id, row.id, "id survives");
eq(view.username, row.username, "username survives");
eq(view.plan, row.plan, "plan survives");
eq(
  view.privateZonePinSetAt,
  row.privateZonePinSetAt,
  "privateZonePinSetAt survives (the fact, not the secret)",
);

console.log(
  `${pass}/${pass + fail} user-client-view cases passed (${schemaColumns.length} columns classified)`,
);
if (fail > 0) process.exit(1);
