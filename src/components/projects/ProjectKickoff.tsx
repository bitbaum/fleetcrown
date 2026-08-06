"use client";

/**
 * "Make it happen" — the one control that starts a project.
 *
 * Everything this runs already existed on the page, scattered: AI profile fill
 * (a chip in Context), milestone generation (a second chip inside that chip's
 * drawer), repo provisioning (inside a collapsed Project settings block), and
 * dispatch (a link to another page). A person with an idea and a paragraph
 * describing it had to find four controls and know their order. This runs them
 * in that order, from the description they already wrote, and reports each one
 * as it lands — so a partial failure still says exactly what got done.
 *
 * The plan comes from lib/project-kickoff, the same module that decides whether
 * this hero renders at all, so the button can never do more or less than the
 * page claims it will.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, Lock, Rocket, Zap } from "lucide-react";
import { postJson } from "@/lib/api/fetch";
import { fleetSurfaceHref } from "@/lib/fleet-context";
import { LONG_TEXT_MAX } from "@/lib/constants";
import {
  KICKOFF_STEP_LABEL,
  hasKickoffSource,
  isThinBrief,
  kickoffBlockedReason,
  planKickoff,
  type KickoffStepId,
} from "@/lib/project-kickoff";

type StepState = "pending" | "running" | "done" | "failed";
type StepRun = { id: KickoffStepId; state: StepState; note?: string };

export function ProjectKickoff({
  projectId,
  projectName,
  workspaceKey,
  description,
  attrs,
  goalCount,
  goalsLocked,
  hasRepo,
  needed,
}: {
  projectId: string;
  projectName: string;
  workspaceKey: string;
  /** The project's own description — the brief an agent gets briefed from. */
  description: string | null;
  attrs: Record<string, string>;
  goalCount: number;
  /** Goals hidden by the private-zone PIN — unknown, not zero. */
  goalsLocked?: boolean;
  hasRepo: boolean;
  /** Server-computed needsKickoff. Once a run has started this card stays put
   *  regardless: the refresh that follows a successful kickoff flips `needed`
   *  to false, and unmounting would take the result and the "watch it work"
   *  link with it. */
  needed: boolean;
}) {
  const router = useRouter();
  // Seeded with the project's own description, and editable from here. It used
  // to be hidden whenever a description existed, which meant a one-sentence
  // description became the entire brief with no way to improve it on the page
  // that runs on it — HamsterCheek's real brief had to be written straight to
  // the database. Everything below is derived from this text, so this text is
  // the thing to put in front of the person, not behind a length check.
  const [text, setText] = useState(description ?? "");
  const [wantRepo, setWantRepo] = useState(true);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [steps, setSteps] = useState<StepRun[] | null>(null);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const source = text.trim() || null;
  const plan = planKickoff({ attrs, goalCount, goalsLocked, hasRepo, wantRepo: !hasRepo && wantRepo });
  // The brief is always shown: every step reads it, dispatch included, so a
  // project whose plan is only "repo + dispatch" still deserves a say in what
  // gets built. It is only *required* by the steps that are extracted from it.
  const requiresSource = plan.includes("profile") || plan.includes("milestones");
  const ready = !requiresSource || hasKickoffSource(source);
  const blocked = kickoffBlockedReason({ goalsLocked });

  function mark(id: KickoffStepId, state: StepState, note?: string) {
    setSteps((prev) => (prev ?? []).map((s) => (s.id === id ? { ...s, state, note } : s)));
  }

  /** POST a step's route; returns its JSON body, or null with the step marked failed. */
  async function step(
    id: KickoffStepId,
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    mark(id, "running");
    try {
      const res = await postJson(`/api/projects/${projectId}/${path}`, body);
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok || !json.ok) {
        mark(id, "failed", typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
        return null;
      }
      return json;
    } catch {
      mark(id, "failed", "Network error");
      return null;
    }
  }

  async function run() {
    setRunning(true);
    setFinished(false);
    setSteps(plan.map((id) => ({ id, state: "pending" })));

    // Profile and milestones read the same text and don't depend on each other.
    // Run them together — serialising two 25s model calls is 25s of nothing.
    await Promise.all(
      plan
        .filter((id) => id === "profile" || id === "milestones")
        .map(async (id) => {
          const json = await step(id, id === "profile" ? "brief" : "roadmap", { text: source });
          if (!json) return;
          if (id === "profile") {
            const count = Object.keys((json.applied as object) ?? {}).length;
            mark(id, "done", `${count} field${count === 1 ? "" : "s"} filled`);
          } else {
            const created = (json.created as string[]) ?? [];
            mark(id, "done", `${created.length} milestone${created.length === 1 ? "" : "s"}`);
          }
        }),
    );

    // Repo second: "auto" resolves the starter from the stack the profile step
    // just wrote, so this only picks well once that has landed.
    if (plan.includes("repo")) {
      const json = await step("repo", "provision", { template: "auto", visibility });
      if (json) {
        const repo = json.repo as { full_name?: string } | undefined;
        mark("repo", "done", repo?.full_name ?? "created");
      }
    }

    // Dispatch last, and unconditionally: a kickoff that sets everything up and
    // then puts nobody to work is the same dead end in a new costume. The
    // prompt is composed server-side from whatever actually landed above.
    const dispatched = await step("dispatch", "dispatch", { kind: "kickoff" });
    if (dispatched) {
      // `ok: true` is not the same as "an agent is working". injectPrompt
      // answers 200/ok when it REFUSED because the user was mid-keystroke in
      // the target tab, and when it queued a command with no runner connected
      // to collect it. Both are flagged on purpose ("so the UI can warn instead
      // of pretending it's running"), and this card exists to report what
      // actually landed — so neither gets laundered into "agent working".
      if (dispatched.blocked) {
        // Nothing was sent; "Try again" is the useful affordance, not "Watch it work".
        mark("dispatch", "failed", "not sent — you were typing in that tab");
      } else if (dispatched.warning === "runner-offline") {
        mark("dispatch", "done", "queued — starts when a runner connects");
      } else {
        mark("dispatch", "done", "agent working");
      }
    }

    setRunning(false);
    setFinished(true);
    // Bring the page in line with what just landed (profile, milestones, repo)
    // without unmounting this card — the result summary and the link to watch
    // it work are the only place the run is reported.
    router.refresh();
  }

  const failures = (steps ?? []).filter((s) => s.state === "failed");
  const dispatchOk = (steps ?? []).some((s) => s.id === "dispatch" && s.state === "done");

  if (!needed && !steps) return null;

  return (
    <section className="ui-card-shell space-y-4 p-4 sm:p-5" aria-labelledby="project-kickoff-title">
      <div>
        <p className="ui-kicker">Start</p>
        <h2 id="project-kickoff-title" className="text-lg font-semibold text-text-primary">
          Make it happen
        </h2>
        {!steps && !blocked && (
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            One click does the setup: {plan.map((id) => KICKOFF_STEP_LABEL[id].toLowerCase()).join(", ")}
            . You can edit anything it writes afterwards.
          </p>
        )}
      </div>

      {/* Refuse up front. The old code ran the plan, created a real GitHub
          repository, and only then hit the dispatch refusal — leaving an empty
          repo and no agent. Nothing here is knowable only at the end. */}
      {!steps && blocked === "goals-locked" && (
        <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-raised p-3">
          <p className="text-sm leading-relaxed text-text-secondary">
            This project&apos;s milestones are behind your PIN, so an agent would be briefed
            without them — and a run that ignores the roadmap redoes work that is already done.
          </p>
          <Link href="/unlock" className="ui-btn-primary gap-2">
            <Lock className="h-4 w-4" aria-hidden="true" /> Unlock to start
          </Link>
        </div>
      )}

      {!steps && !blocked && (
        <div className="space-y-1.5">
          <label htmlFor="project-kickoff-brief" className="ui-micro-label">
            The brief — everything below is written from this
          </label>
          <textarea
            id="project-kickoff-brief"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={LONG_TEXT_MAX}
            disabled={running}
            placeholder={`What is ${projectName}, who is it for, and what should exist at the end? A paragraph is plenty — everything else is derived from it.`}
            className="ui-input w-full text-base leading-relaxed sm:text-sm"
          />
          {isThinBrief(text) && (
            <p className="text-xs text-text-secondary">
              That is about a sentence. It will run, but the profile and milestones can only be as
              specific as this is — say who it is for and what should exist at the end.
            </p>
          )}
        </div>
      )}

      {!steps && !blocked && !hasRepo && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised p-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={wantRepo}
              disabled={running}
              onChange={(e) => setWantRepo(e.target.checked)}
              className="h-5 w-5 shrink-0"
            />
            Create the GitHub repository too
          </label>
          {wantRepo && (
            <select
              className="ui-input-compact"
              value={visibility}
              disabled={running}
              onChange={(e) => setVisibility(e.target.value as "private" | "public")}
              aria-label="Repository visibility"
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          )}
          <span className="text-xs text-text-secondary">
            {wantRepo
              ? "Starter picked from your stack. Without a repo an agent has nowhere to build."
              : "Skipped — an agent can still plan, but it has nowhere to write code."}
          </span>
        </div>
      )}

      {!finished && !blocked && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={running || !ready}
            className="ui-btn-primary gap-2 px-5 py-3 text-base"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Zap className="h-4 w-4" aria-hidden="true" />}
            {running ? "Making it happen…" : "Make it happen"}
          </button>
          {!ready && (
            <span className="text-xs text-text-secondary">
              Write a sentence about the project first — that is the whole brief.
            </span>
          )}
        </div>
      )}

      {steps && (
        <ol className="space-y-1.5 border-t border-border-subtle pt-3">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <StepIcon state={s.state} />
              <span className={s.state === "failed" ? "text-text-secondary" : "text-text-primary"}>
                {KICKOFF_STEP_LABEL[s.id]}
              </span>
              {s.note && (
                <span className={s.state === "failed" ? "ui-error text-xs" : "text-xs text-text-secondary"}>
                  {s.note}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {finished && (
        <div className="space-y-2 border-t border-border-subtle pt-3">
          {dispatchOk ? (
            <Link href={fleetSurfaceHref("terminal", workspaceKey)} className="ui-btn-primary gap-2">
              <Rocket className="h-4 w-4" aria-hidden="true" /> Watch it work
            </Link>
          ) : (
            <button type="button" onClick={run} className="ui-btn-secondary gap-2">
              Try again
            </button>
          )}
          {failures.length > 0 && (
            <p className="text-xs text-text-secondary">
              {failures.length} step{failures.length === 1 ? "" : "s"} did not complete — everything above
              them landed and is editable on this page.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "running") return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-text" aria-hidden="true" />;
  if (state === "done") return <Check className="h-4 w-4 shrink-0 text-status-positive" aria-hidden="true" />;
  if (state === "failed") return <AlertCircle className="h-4 w-4 shrink-0 text-status-negative" aria-hidden="true" />;
  return <span className="ui-dot ui-dot-neutral mx-1.5 shrink-0" aria-hidden="true" />;
}
