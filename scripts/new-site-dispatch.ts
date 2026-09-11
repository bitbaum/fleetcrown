#!/usr/bin/env -S npx tsx
/**
 * new-site-dispatch — ask the fleet to CREATE a site, rather than creating it
 * yourself.
 *
 * Until now the fleet could analyze a repo (hosted_analyze) and change one
 * (hosted_dispatch → Hermes → PR), but it could not bring one into existence.
 * So every site so far was made by a person running new-site.sh in a terminal —
 * causius on 2026-09-10 included. That is the one step of the factory that
 * still required a human to start it, and this is the command that closes it.
 *
 * What it is NOT: a prompt. The older control path injects free text into a live
 * terminal for an agent to obey, which is the shape that gets prompt-injected.
 * This queues four validated fields that reach an audited script as an argument
 * vector — nothing here can become shell syntax or an instruction.
 *
 * The runner that drains it must be armed (FLEETCROWN_SITE_FACTORY=1) and told
 * where the script lives (FLEETCROWN_NEW_SITE_SCRIPT). A runner without both
 * reports the refusal on the command instead of doing anything.
 *
 * Usage:
 *   DATABASE_URL=… npx tsx scripts/new-site-dispatch.ts <slug> "<Title>" [kind] [status]
 * Example:
 *   … scripts/new-site-dispatch.ts causius "Causius" product validating
 */
import { getSelfImprovementTarget } from "@/db/queries/frontier";
import { requestNewSite } from "@/lib/hosted-runner/provision";

async function main() {
  const [slug, title, kind = "product", status = "validating"] = process.argv.slice(2);
  if (!slug) {
    console.error(
      'Usage: npx tsx scripts/new-site-dispatch.ts <slug> "<Title>" [kind] [status]',
    );
    process.exit(1);
  }

  const target = await getSelfImprovementTarget();
  if (!target) {
    console.error("No FleetCrown owner resolved — nothing to dispatch for.");
    process.exit(1);
  }

  const res = await requestNewSite(target.userId, { slug, title, kind, status });
  if (!res.ok) {
    console.error(`✗ ${res.error}`);
    process.exit(1);
  }

  console.log(`✓ queued site creation ${res.commandId}`);
  console.log(`  slug:   ${res.request.slug}   title: ${res.request.title}`);
  console.log(`  kind:   ${res.request.kind}/${res.request.status}`);
  console.log(`  host:   https://${res.host} (once the runner has built it)`);
  console.log(
    `  Drained by the hosted runner — repo → register → box → deploy. Minutes, not seconds.`,
  );
  console.log(
    `  Watch:  journalctl -u fleetcrown-hosted-runner -f    |    Activity (source=hosted-runner)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
