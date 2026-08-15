/**
 * Create (or recreate) the public demo tenant.
 *
 *   DEMO_ACCESS_ENABLED=1 DATABASE_URL=... npx tsx scripts/seed-demo.ts
 *
 * Same code path as the nightly cron — see src/lib/demo-seed.ts for what it
 * seeds and, more importantly, for why the wipe is written the way it is.
 *
 * This is destructive to the demo tenant and only to the demo tenant. It
 * refuses without DEMO_ACCESS_ENABLED=1, and it resolves its target by the demo
 * email rather than by anything passed in.
 */
import { resetDemoTenant, DemoDisabledError } from "../src/lib/demo-seed";

async function main() {
  const { userId, removed, seeded } = await resetDemoTenant();

  const removedTotal = Object.values(removed).reduce((a, b) => a + b, 0);
  if (removedTotal > 0) {
    console.log(`removed ${removedTotal} row(s) from the previous demo tenant:`);
    for (const [table, n] of Object.entries(removed).sort()) console.log(`  ${table}: ${n}`);
  } else {
    console.log("no previous demo tenant found");
  }

  console.log(`\nseeded demo user ${userId}:`);
  for (const [kind, n] of Object.entries(seeded).sort()) console.log(`  ${kind}: ${n}`);
  console.log("\nSign in at /sign-in — the demo button is now live.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    if (err instanceof DemoDisabledError) {
      console.error(`\n${err.message}`);
      console.error("Set DEMO_ACCESS_ENABLED=1 for the instance that should host the demo.");
      process.exit(2);
    }
    console.error(err);
    process.exit(1);
  });
