#!/usr/bin/env -S npx tsx
/**
 * hermes-dispatch — send a coding task to the hosted Hermes runner ON PURPOSE.
 *
 * inject-core only routes to Hermes as an automatic fallback (a WORK dispatch
 * queued while the local Fleet Runner is offline). This is the intentional path:
 * queue a task for a project and let the hosted runner do it laptop-off.
 *
 * The task is enqueued as a `hosted_dispatch` command; the
 * fleetcrown-hosted-runner.timer drains it (~≤1 min): clone → Hermes in its
 * sandbox → commit on a branch → open a PR. Nothing auto-merges — you review it.
 * Progress is visible in Activity (source="hosted-runner", adapter="hermes").
 *
 * Resolution + enqueue + Activity attribution are shared with the API route via
 * dispatchToHostedRunner — this script only supplies the owner userId (the box
 * has no session) and prints the result.
 *
 * Usage:
 *   DATABASE_URL=… npx tsx scripts/hermes-dispatch.ts <projectKey> "<task>" [model]
 * Example:
 *   … scripts/hermes-dispatch.ts fleetcrown "Add a CONTRIBUTING.md with build + test steps"
 */
import { getSelfImprovementTarget } from "@/db/queries/frontier";
import { dispatchToHostedRunner } from "@/lib/hosted-runner/dispatch";

async function main() {
  const [projectKey, task, model] = process.argv.slice(2);
  if (!projectKey || !task) {
    console.error('Usage: npx tsx scripts/hermes-dispatch.ts <projectKey> "<task>" [model]');
    process.exit(1);
  }
  const target = await getSelfImprovementTarget();
  if (!target) {
    console.error("No FleetCrown owner resolved — nothing to dispatch for.");
    process.exit(1);
  }

  const res = await dispatchToHostedRunner({
    userId: target.userId,
    projectKey,
    task,
    ...(model ? { model } : {}),
  });
  if (!res.ok) {
    console.error(`✗ ${res.error}`);
    if (res.knownProjects?.length)
      console.error(`  Known projects: ${res.knownProjects.join(", ")}`);
    process.exit(1);
  }

  console.log(`✓ queued hosted Hermes dispatch ${res.hostedDispatchId}`);
  console.log(`  project: ${res.projectName}   repo: ${res.gitUrl}`);
  console.log(`  task:    ${task}`);
  console.log(
    `  Drained by fleetcrown-hosted-runner.timer (~≤1 min) → clone → Hermes → PR (never auto-merged).`,
  );
  console.log(
    `  Watch:   journalctl -u fleetcrown-hosted-runner -f    |    Activity (source=hosted-runner)`,
  );
  process.exit(0);
}

main();
