// Manually generate today's frontier digest (same path the daily cron runs).
// Useful for seeding the first digest and for iterating on ranking quality.
//
//   DATABASE_URL=... GROQ_API_KEY=... npx tsx scripts/seed-frontier.ts

import { runFrontierDigest, runFrontierProposals } from "@/lib/frontier/run";

async function main() {
  const r = await runFrontierDigest();
  console.log(`✓ frontier digest ${r.saved.digestDate} (model: ${r.saved.model})`);
  console.log(
    `  ${r.itemCount} items / ${r.candidateCount} candidates / ${r.sourcesOk} sources ok, ${r.sourcesFailed} failed`,
  );
  console.log(`  headline: ${r.saved.headline}`);
  for (const it of r.saved.items) {
    console.log(`   • [${it.category}] ${it.title}`);
  }

  console.log("\n— self-improvement proposals —");
  const p = await runFrontierProposals(r.saved);
  if (p.skipped) {
    console.log(`  skipped: ${p.skipped}`);
  } else {
    console.log(`  drafted ${p.drafted}, surfaced ${p.surfaced} (cleared the critique bar)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
