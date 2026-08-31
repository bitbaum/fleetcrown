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
import {
  claimNextPendingCommand,
  markCommandExecuted,
  type HostedAnalyzePayload,
  type HostedDispatchPayload,
} from "@/db/queries/pending-commands";
import { getProjectContext } from "@/db/queries/project-context";
import {
  getRecentProjectActivity,
  type RecentProjectActivity,
} from "@/db/queries/orchestration-events";
import { getSelfImprovementTarget } from "@/db/queries/frontier";
import { getGithubToken } from "@/lib/github-token";
import { appendProjectDevLog } from "@/db/queries/user-projects";
import { createOrchestrationEvent } from "@/db/queries/orchestration-events";
import type { AdapterId, OrchestrationEventType } from "@/lib/orchestration";
import { analyzeRepo } from "@/lib/hosted-runner/analyze";
import { runHermesTask } from "@/lib/hosted-runner/run-hermes";

// The real executor id for a hosted coding dispatch. Hermes is a legitimate
// agent id (ALL_ADAPTERS) but intentionally NOT in the dispatchable
// ORCHESTRATION_ADAPTER_IDS, so record it with a localized cast — the same
// pattern close-sweep already uses for adapter strings outside that set.
const HERMES_ADAPTER = "hermes" as AdapterId;

const POLL_MS = 5_000;
// Both hosted classes: read-only analysis (Groq, Phase 0) + write-class dispatch
// to a sandboxed coding agent (Hermes, Phase 1). Local-runner dispatch/inject
// commands are deliberately NOT claimed here.
const HOSTED_TYPES = ["hosted_analyze", "hosted_dispatch"];

/** Compact "what was just done" block so Hermes doesn't repeat or collide with
 *  recent work. Consumer-side because it enriches EVERY hosted dispatch (auto-
 *  routed or intentional) at the single choke point, not per trigger. */
function renderRecentActivity(rows: RecentProjectActivity[]): string | null {
  if (!rows.length) return null;
  const now = Date.now();
  const ago = (d: Date) => {
    const mins = Math.max(1, Math.round((now - d.getTime()) / 60_000));
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    return hrs < 48 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
  };
  const lines = rows.map((r) => {
    const who = r.adapter ? `${r.adapter}: ` : "";
    const mark = r.eventType === "task_failed" ? "✗" : "✓";
    return `- ${ago(r.happenedAt)} ${mark} ${who}${(r.detail ?? "").slice(0, 160)}`;
  });
  return [
    "Recent activity on this project (newest first — already done, do NOT repeat or undo it):",
    ...lines,
  ].join("\n");
}

async function logResult(userId: string, projectKey: string, label: string, text: string) {
  await appendProjectDevLog(userId, projectKey, {
    date: new Date().toISOString(),
    done: label.slice(0, 100),
    next: text.slice(0, 2_000),
    tests: "",
    todos: "",
    health: "good",
  }).catch((e) => console.error("[hosted-runner] devlog append failed:", e));
}

/** Emit a lifecycle event into orchestration_events — the SAME stream inject-core
 *  writes and Activity reads — so hosted (Hermes/analysis) runs are observable in
 *  the product instead of only in console logs. Fire-and-forget: telemetry must
 *  never fail the run. `adapter` records the true executor ("hermes" for a coding
 *  dispatch; null for read-only analysis). */
async function emitHostedEvent(
  userId: string,
  projectKey: string,
  eventType: OrchestrationEventType,
  detail: string,
  adapter?: AdapterId,
) {
  await createOrchestrationEvent({
    userId,
    projectKey,
    eventType,
    source: "hosted-runner",
    adapter: adapter ?? null,
    detail: detail.slice(0, 500),
    happenedAt: new Date(),
  }).catch((e) => console.error("[hosted-runner] event emit failed:", e));
}

/** Claim + execute one hosted command (analyze or dispatch). False when queue empty. */
async function tick(userId: string): Promise<boolean> {
  const cmd = await claimNextPendingCommand([userId], HOSTED_TYPES);
  if (!cmd) return false;
  const p = cmd.payload as HostedAnalyzePayload | HostedDispatchPayload;
  const [ctx, dbToken] = await Promise.all([
    getProjectContext(userId, p.projectKey).catch(() => null),
    getGithubToken(userId).catch(() => null),
  ]);
  // The owner's linked-OAuth token (DB) is preferred; on a hosted box where no
  // GitHub account is linked, fall back to GITHUB_TOKEN (provided by `gh auth
  // login` on the box → `gh auth token`). Without either, Hermes still runs but
  // can't push/PR — run-hermes surfaces that as an error, not silent data loss.
  const token = dbToken ?? process.env.GITHUB_TOKEN ?? null;
  try {
    if (cmd.type === "hosted_dispatch") {
      // Phase 1: write-class task → Hermes in its own sandbox (orchestrate, not out-build).
      console.log(`[hosted-runner] dispatch→hermes ${p.projectKey}: ${p.task.slice(0, 60)}`);
      void emitHostedEvent(
        userId,
        p.projectKey,
        "task_started",
        `Hermes dispatch — ${p.task.slice(0, 120)}`,
        HERMES_ADAPTER,
      );
      const model = (cmd.payload as HostedDispatchPayload).model;
      // Recent-activity context: give Hermes the "what was just done" signal so it
      // doesn't repeat or undo recent work. Single choke point — every hosted
      // dispatch (auto-routed or intentional) gets it here, not per trigger.
      const recent = await getRecentProjectActivity(userId, p.projectKey).catch(() => []);
      const res = await runHermesTask({
        gitUrl: p.gitUrl,
        task: p.task,
        projectContext: ctx,
        recentActivity: renderRecentActivity(recent),
        token,
        model,
      });
      if (res.ok) {
        const summary = res.noChanges
          ? `${res.output}\n\n(Hermes made no file changes.)`
          : `${res.output}\n\n— changed:\n${res.diff || "(no diff)"}${res.prUrl ? `\n\nPR: ${res.prUrl}` : res.branch ? `\n\nPushed branch: ${res.branch}` : ""}`;
        await markCommandExecuted(cmd.id, userId, { ok: true, text: summary });
        await logResult(
          userId,
          p.projectKey,
          `Hosted dispatch (Hermes) — ${p.task.slice(0, 70)}`,
          summary,
        );
        void emitHostedEvent(
          userId,
          p.projectKey,
          "task_completed",
          res.prUrl
            ? `Hermes → PR ${res.prUrl}`
            : res.noChanges
              ? "Hermes: no file changes"
              : `Hermes pushed ${res.branch ?? "a branch"}`,
          HERMES_ADAPTER,
        );
        console.log(
          `[hosted-runner] ✓ ${p.projectKey} (hermes/${res.model})${res.prUrl ? ` → ${res.prUrl}` : ""}`,
        );
      } else {
        await markCommandExecuted(cmd.id, userId, { ok: false, error: res.error });
        // Failures used to vanish into console only — log + emit so a broken hosted
        // path is visible in the project dev log and Activity, not archaeology.
        await logResult(
          userId,
          p.projectKey,
          `Hosted dispatch (Hermes) FAILED — ${p.task.slice(0, 60)}`,
          res.error,
        );
        void emitHostedEvent(
          userId,
          p.projectKey,
          "task_failed",
          `Hermes failed — ${res.error}`,
          HERMES_ADAPTER,
        );
        console.log(`[hosted-runner] ✗ ${p.projectKey}: ${res.error}`);
      }
    } else {
      // Phase 0: read-only analysis via Groq.
      console.log(`[hosted-runner] analyze ${p.projectKey}: ${p.task.slice(0, 60)}`);
      void emitHostedEvent(
        userId,
        p.projectKey,
        "task_started",
        `Hosted analysis — ${p.task.slice(0, 120)}`,
      );
      const res = await analyzeRepo({ gitUrl: p.gitUrl, task: p.task, projectContext: ctx, token });
      if (res.ok) {
        await markCommandExecuted(cmd.id, userId, { ok: true, text: res.report });
        await logResult(
          userId,
          p.projectKey,
          `Hosted analysis — ${p.task.slice(0, 80)}`,
          res.report,
        );
        void emitHostedEvent(
          userId,
          p.projectKey,
          "task_completed",
          `Hosted analysis complete (${res.model})`,
        );
        console.log(`[hosted-runner] ✓ ${p.projectKey} (${res.model})`);
      } else {
        await markCommandExecuted(cmd.id, userId, { ok: false, error: res.error });
        await logResult(
          userId,
          p.projectKey,
          `Hosted analysis FAILED — ${p.task.slice(0, 60)}`,
          res.error,
        );
        void emitHostedEvent(
          userId,
          p.projectKey,
          "task_failed",
          `Hosted analysis failed — ${res.error}`,
        );
        console.log(`[hosted-runner] ✗ ${p.projectKey}: ${res.error}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "hosted run failed";
    await markCommandExecuted(cmd.id, userId, { ok: false, error: msg });
    void emitHostedEvent(
      userId,
      p.projectKey,
      "task_failed",
      `Hosted run threw — ${msg}`,
      cmd.type === "hosted_dispatch" ? HERMES_ADAPTER : undefined,
    );
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
  if (!target) {
    console.error("[hosted-runner] no fleetcrown owner resolved — nothing to serve");
    process.exit(1);
  }
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
  console.log(
    `[hosted-runner] presence ON for ${userId}; polling hosted_analyze every ${POLL_MS}ms`,
  );
  const shutdown = async () => {
    await setRunnerConnected(userId, false).catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  for (;;) {
    try {
      await drain(userId);
    } catch (e) {
      console.error("[hosted-runner] loop error:", e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
