// The report's INPUT, as pure text. No DB, no React — importable from tests.
//
// Split out of digest-generator.ts (which imports the Postgres pool) so the
// thing that decides what the model is told can actually be asserted on. The
// generator keeps the Groq call and the caching; this file keeps the judgement.

import type { ActivityEvent } from "@/lib/activity-events";
import { eventNeedsAttention, tallyActivityEvents } from "@/lib/activity-events";
import { computeMomentum, summarizeActivity } from "@/lib/activity-summary";

export type DigestInput = {
  events: ActivityEvent[];
  projectKey: string | null;
  windowLabel: string;
  /** Actions in the window before this one — lets the report say whether the
   *  fleet is speeding up or stalling, which is the single most interesting
   *  thing a recurring report can tell you and the one thing a snapshot
   *  cannot. */
  previousCount?: number;
};

/**
 * The facts the report is built from.
 *
 * This used to feed the model `timeline` prompt bodies only — which, for every
 * assembled dispatch, was the literal string "…assembled operator dispatch
 * (brief + goals + autopilot rules; full text hidden)". The report was
 * summarising a placeholder, and it never saw a single run OUTCOME or error, so
 * it structurally could not say what happened or what broke. That is why the
 * generated reports read as vague filler.
 *
 * Now it reads `events` — dispatch joined to run — so each line carries
 * the ask, the outcome, the agent's own done/next, and the real failure cause.
 */
export function buildDigestUserPrompt({
  events,
  projectKey,
  windowLabel,
  previousCount,
}: DigestInput): string {
  const lines: string[] = [];
  lines.push(`Window: last ${windowLabel}${projectKey ? ` · filtered to project "${projectKey}"` : ""}`);

  const tallies = tallyActivityEvents(events);
  const summary = summarizeActivity(events);
  lines.push(
    `Totals: ${tallies.total} actions · ${tallies.done} completed · ${tallies.attention} need attention · ${tallies.running} still running`,
  );
  if (summary.agentLabel) {
    lines.push(`Agent time (summed wall-clock of finished runs): ${summary.agentLabel}`);
  }
  lines.push(`Projects touched: ${summary.projects}${summary.busiestProject ? ` (busiest: ${summary.busiestProject})` : ""}`);
  if (typeof previousCount === "number") {
    const momentum = computeMomentum(tallies.total, previousCount);
    lines.push(
      `Previous window: ${previousCount} actions${momentum.label ? ` — ${momentum.label}` : ""}`,
    );
  }
  lines.push("");

  const trim = (text: string, max: number) => {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  };

  // Failures first — they are what a report is for, and the model should see
  // them before it runs out of context on routine successes.
  const attention = events.filter(eventNeedsAttention);
  if (attention.length > 0) {
    lines.push(`FAILED OR STALLED (${attention.length}):`);
    for (const e of attention.slice(0, 20)) {
      const parts = [
        `[${e.occurredAt.slice(0, 16)}] ${e.projectKey} · ${e.intentLabel} · ${e.outcomeLabel}`,
      ];
      if (e.durationLabel) parts.push(`ran ${e.durationLabel}`);
      if (e.ask?.preview) parts.push(`asked: ${trim(e.ask.preview, 200)}`);
      if (e.error) parts.push(`error: ${trim(e.error, 300)}`);
      if (e.done) parts.push(`reported: ${trim(e.done, 200)}`);
      lines.push(`- ${parts.join(" | ")}`);
    }
    lines.push("");
  }

  const completed = events.filter((e) => e.outcome === "success");
  if (completed.length > 0) {
    lines.push(`COMPLETED (${completed.length}):`);
    for (const e of completed.slice(0, 20)) {
      const parts = [`[${e.occurredAt.slice(0, 16)}] ${e.projectKey} · ${e.intentLabel}`];
      if (e.durationLabel) parts.push(`took ${e.durationLabel}`);
      if (e.ask?.preview) parts.push(`asked: ${trim(e.ask.preview, 160)}`);
      if (e.done) parts.push(`did: ${trim(e.done, 260)}`);
      if (e.verification) {
        parts.push(
          e.verification.met
            ? `verified by ${e.verification.judge}`
            : `verification FAILED (${e.verification.judge}): ${trim(e.verification.gap ?? "no detail", 120)}`,
        );
      }
      lines.push(`- ${parts.join(" | ")}`);
    }
    lines.push("");
  }

  const running = events.filter((e) => e.outcome === "running");
  if (running.length > 0) {
    lines.push(`STILL RUNNING (${running.length}):`);
    for (const e of running.slice(0, 10)) {
      const ask = e.ask?.preview ? ` | asked: ${trim(e.ask.preview, 160)}` : "";
      lines.push(`- [${e.occurredAt.slice(0, 16)}] ${e.projectKey} · ${e.intentLabel}${ask}`);
    }
    lines.push("");
  }

  // The agents' own forward-looking lines — the most actionable thing recorded.
  const nextSteps = events.filter((e) => e.next);
  if (nextSteps.length > 0) {
    lines.push(`AGENT-RECORDED NEXT STEPS (${nextSteps.length}):`);
    for (const e of nextSteps.slice(0, 15)) {
      lines.push(`- ${e.projectKey}: ${trim(e.next!, 220)}`);
    }
    lines.push("");
  }

  // Dispatches that never produced a run — queued, or waiting on a builder.
  const queued = events.filter((e) => e.outcome === "dispatched" && !e.isLocalChat);
  if (queued.length > 0) {
    lines.push(`SENT BUT NO RUN RECORDED (${queued.length}): ${queued
      .slice(0, 10)
      .map((e) => e.projectKey)
      .join(", ")}`);
  }

  return lines.join("\n");
}

