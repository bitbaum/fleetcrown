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
import { claimNextPendingCommand, markCommandExecuted, type HostedAnalyzePayload, type HostedDispatchPayload } from "@/db/queries/pending-commands";
import { getProjectContext } from "@/db/queries/project-context";
import { getSelfImprovementTarget } from "@/db/queries/frontier";
import { getGithubToken } from "@/lib/github-token";
import { appendProjectDevLog } from "@/db/queries/user-projects";
import { analyzeRepo } from "@/lib/hosted-runner/analyze";
import { runHermesTask } from "@/lib/hosted-runner/run-hermes";

const POLL_MS = 5_000;
// Both hosted classes: read-only analysis (Groq, Phase 0) + write-class dispatch
// to a sandboxed coding agent (Hermes, Phase 1). Local-runner dispatch/inject
// commands are deliberately NOT claimed here.
const HOSTED_TYPES = ["hosted_analyze", "hosted_dispatch"];

async function logResult(userId: string, projectKey: string, label: string, text: string) {
  await appendProjectDevLog(userId, projectKey, {
    date: new Date().toISOString(),
    done: label.slice(0, 100),
    next: text.slice(0, 2_000),
    tests: "", todos: "", health: "good",
  }).catch((e) => console.error("[hosted-runner] devlog append failed:", e));
}

/** Claim + execute one hosted command (analyze or dispatch). False when queue empty. */
async function tick(userId: string): Promise<boolean> {
  const cmd = await claimNextPendingCommand([userId], HOSTED_TYPES);
  if (!cmd) return false;
  const p = cmd.payload as HostedAnalyzePayload | HostedDispatchPayload;
  const [ctx, token] = await Promise.all([
    getProjectContext(userId, p.projectKey).catch(() => null),
    getGithubToken(userId).catch(() => null),
  ]);
  try {
    if (cmd.type === "hosted_dispatch") {
      // Phase 1: write-class task → Hermes in its own sandbox (orchestrate, not out-build).
      console.log(`[hosted-runner] dispatch→hermes ${p.projectKey}: ${p.task.slice(0, 60)}`);
      const model = (cmd.payload as HostedDispatchPayload).model;
      const res = await runHermesTask({ gitUrl: p.gitUrl, task: p.task, projectContext: ctx, token, model });
      if (res.ok) {
        await markCommandExecuted(cmd.id, userId, { ok: true, text: `${res.output}\n\n— changed:\n${res.diff || "(no diff)"}` });
        await logResult(userId, p.projectKey, `Hosted dispatch (Hermes) — ${p.task.slice(0, 70)}`, `${res.output}\n\n${res.diff}`);
        console.log(`[hosted-runner] ✓ ${p.projectKey} (hermes/${res.model})`);
      } else {
        await markCommandExecuted(cmd.id, userId, { ok: false, error: res.error });
        console.log(`[hosted-runner] ✗ ${p.projectKey}: ${res.error}`);
      }
    } else {
      // Phase 0: read-only analysis via Groq.
      console.log(`[hosted-runner] analyze ${p.projectKey}: ${p.task.slice(0, 60)}`);
      const res = await analyzeRepo({ gitUrl: p.gitUrl, task: p.task, projectContext: ctx, token });
      if (res.ok) {
        await markCommandExecuted(cmd.id, userId, { ok: true, text: res.report });
        await logResult(userId, p.projectKey, `Hosted analysis — ${p.task.slice(0, 80)}`, res.report);
        console.log(`[hosted-runner] ✓ ${p.projectKey} (${res.model})`);
      } else {
        await markCommandExecuted(cmd.id, userId, { ok: false, error: res.error });
        console.log(`[hosted-runner] ✗ ${p.projectKey}: ${res.error}`);
      }
    }
  } catch (e) {
    await markCommandExecuted(cmd.id, userId, { ok: false, error: e instanceof Error ? e.message : "hosted run failed" });
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
