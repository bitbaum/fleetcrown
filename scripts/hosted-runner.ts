// Hosted ephemeral runner — Phase 0 worker loop.
//
// Wires the read-only analysis core (src/lib/hosted-runner/analyze.ts) to the
// real runner loop: register presence so projects aren't dark, drain the
// `hosted_analyze` queue, run the analysis on hosted compute, report the result
// to the command + the project dev log. No writes to repos, no local runner
// needed — the fleet does read-only work while the operator's laptop is off.
//
// Run:  DATABASE_URL=… GROQ_API_KEY=… npx tsx scripts/hosted-runner.ts          (loop)
//       …                                npx tsx scripts/hosted-runner.ts --once  (drain + exit)
//
// Phase 1 (sandboxed coding agent) replaces analyzeRepo with a containerized
// agent and adds the dispatch/inject command types. See
// docs/architecture/hosted-ephemeral-runner.md.

import { setRunnerConnected } from "@/db/queries/runner-presence";
import { claimNextPendingCommand, markCommandExecuted, type HostedAnalyzePayload } from "@/db/queries/pending-commands";
import { getProjectContext } from "@/db/queries/project-context";
import { getSelfImprovementTarget } from "@/db/queries/frontier";
import { getGithubToken } from "@/lib/github-token";
import { appendProjectDevLog } from "@/db/queries/user-projects";
import { analyzeRepo } from "@/lib/hosted-runner/analyze";

const POLL_MS = 5_000;

/** Claim + execute one hosted_analyze command. Returns false when the queue is empty. */
async function tick(userId: string): Promise<boolean> {
  const cmd = await claimNextPendingCommand([userId], ["hosted_analyze"]);
  if (!cmd) return false;
  const p = cmd.payload as HostedAnalyzePayload;
  console.log(`[hosted-runner] analyzing ${p.projectKey}: ${p.task.slice(0, 60)}`);
  try {
    const [ctx, token] = await Promise.all([
      getProjectContext(userId, p.projectKey).catch(() => null),
      getGithubToken(userId).catch(() => null),
    ]);
    const res = await analyzeRepo({ gitUrl: p.gitUrl, task: p.task, projectContext: ctx, token });
    if (res.ok) {
      await markCommandExecuted(cmd.id, userId, { ok: true, text: res.report });
      await appendProjectDevLog(userId, p.projectKey, {
        date: new Date().toISOString(),
        done: `Hosted analysis — ${p.task.slice(0, 80)}`,
        next: res.report.slice(0, 2_000),
        tests: "", todos: "", health: "good",
      }).catch((e) => console.error("[hosted-runner] devlog append failed:", e));
      console.log(`[hosted-runner] ✓ ${p.projectKey} (${res.model})`);
    } else {
      await markCommandExecuted(cmd.id, userId, { ok: false, error: res.error });
      console.log(`[hosted-runner] ✗ ${p.projectKey}: ${res.error}`);
    }
  } catch (e) {
    await markCommandExecuted(cmd.id, userId, { ok: false, error: e instanceof Error ? e.message : "hosted analysis failed" });
  }
  return true;
}

async function drain(userId: string): Promise<number> {
  let n = 0;
  while (await tick(userId)) n++;
  return n;
}

async function main() {
  const once = process.argv.includes("--once");
  // Phase 0 serves the FleetCrown product owner's projects. Multi-tenant
  // scheduling across users is Phase 3.
  const target = await getSelfImprovementTarget();
  if (!target) { console.error("[hosted-runner] no fleetcrown owner resolved — nothing to serve"); process.exit(1); }
  const userId = target.userId;

  // --once is a one-shot drain (e.g. a cron tick): do the work, do NOT claim a
  // persistent "online" presence the loop would own. Only the long-running loop
  // represents a continuously-available runner.
  if (once) {
    const n = await drain(userId);
    console.log(`[hosted-runner] drained ${n} (one-shot; presence unchanged)`);
    process.exit(0);
  }

  await setRunnerConnected(userId, true);
  console.log(`[hosted-runner] presence ON for ${userId}; polling hosted_analyze every ${POLL_MS}ms`);
  const shutdown = async () => { await setRunnerConnected(userId, false).catch(() => {}); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  for (;;) {
    try { await drain(userId); } catch (e) { console.error("[hosted-runner] loop error:", e); }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
