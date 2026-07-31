// Data controls: the account-export redaction (src/lib/account-export.ts) must
// never leak credential hashes or Stripe internals into the downloaded JSON —
// the manifest must state exactly what is excluded.
// Run: npx tsx scripts/test/account-export.ts
import {
  redactUserRow,
  buildExportManifest,
  ACCOUNT_EXPORT_FILENAME,
} from "@/lib/account-export";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; }
  else { fail++; console.error(`✗ ${label}`); }
}

const userRow = {
  id: "u-1",
  email: "g@example.com",
  username: "g",
  passwordHash: "bcrypt$secret",
  privateZonePinHash: "bcrypt$pin",
  stripeCustomerId: "cus_123",
  stripeSubscriptionId: "sub_456",
  plan: "pro",
  fleetSettings: { a: 1 },
};

const redacted = redactUserRow(userRow) as Record<string, unknown>;

ok(!("passwordHash" in redacted), "passwordHash stripped");
ok(!("privateZonePinHash" in redacted), "privateZonePinHash stripped");
ok(!("stripeCustomerId" in redacted), "stripeCustomerId stripped");
ok(!("stripeSubscriptionId" in redacted), "stripeSubscriptionId stripped");
ok(redacted.email === "g@example.com", "email kept");
ok(redacted.plan === "pro", "plan kept");
ok(JSON.stringify(redacted.fleetSettings) === JSON.stringify({ a: 1 }), "fleetSettings kept");
// original object must be untouched (redaction copies, never mutates)
ok(userRow.passwordHash === "bcrypt$secret", "input row not mutated");

const manifest = buildExportManifest("u-1", ["a", "b"]);
ok(manifest.user_id === "u-1", "manifest user_id");
ok(Array.isArray(manifest.scope) && manifest.scope.length === 2, "manifest scope");
ok(
  manifest.excluded.some((e) => e.includes("PIN")) &&
    manifest.excluded.some((e) => e.includes("Stripe")),
  "manifest states exclusions",
);
ok(ACCOUNT_EXPORT_FILENAME.endsWith(".json"), "filename is json");

if (fail > 0) {
  console.error(`account-export: ${fail} failed, ${pass} passed`);
  process.exit(1);
}
console.log(`account-export: ${pass} checks passed`);
