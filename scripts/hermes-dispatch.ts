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
 * Usage:
 *   DATABASE_URL=… npx tsx scripts/hermes-dispatch.ts <projectKey> "<task>" [model]
 * Example:
 *   … scripts/hermes-dispatch.ts fleetcrown "Add a CONTRIBUTING.md with build + test steps"
 */
import { getSelfImprovementTarget } from "@/db/queries/frontier";
import { getUserProjects } from "@/db/queries/user-projects";
import { enqueueHostedDispatchCommand } from "@/db/queries/pending-commands";

async function main() {
  const [projectKey, task, model] = process.argv.slice(2);
  if (!projectKey || !task) {
    console.error('Usage: npx tsx scripts/hermes-dispatch.ts <projectKey> "<task>" [model]');
    process.exit(1);
  }
  const target = await getSelfImprovementTarget();
  if (!target) { console.error("No FleetCrown owner resolved — nothing to dispatch for."); process.exit(1); }

  const projects = await getUserProjects(target.userId);
  const key = projectKey.toLowerCase();
  const project = projects.find(
    (p) => p.name?.toLowerCase() === key || (p.gitUrl ?? "").toLowerCase().includes(`/${key}`),
  );
  if (!project) {
    console.error(`No project matching "${projectKey}". Known: ${projects.map((p) => p.name).filter(Boolean).join(", ")}`);
    process.exit(1);
  }
  if (!project.gitUrl) {
    console.error(`Project "${project.name}" has no gitUrl — set one (Projects → edit) so Hermes can clone it.`);
    process.exit(1);
  }

  const id = await enqueueHostedDispatchCommand(target.userId, {
    projectKey,
    gitUrl: project.gitUrl,
    task,
    ...(model ? { model } : {}),
  });
  console.log(`✓ queued hosted Hermes dispatch ${id}`);
  console.log(`  project: ${project.name}   repo: ${project.gitUrl}`);
  console.log(`  task:    ${task}`);
  console.log(`  Drained by fleetcrown-hosted-runner.timer (~≤1 min) → clone → Hermes → PR (never auto-merged).`);
  console.log(`  Watch:   journalctl -u fleetcrown-hosted-runner -f    |    Activity (source=hosted-runner)`);
  process.exit(0);
}

main();
