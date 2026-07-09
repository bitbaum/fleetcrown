/**
 * Server-rendered sections of the full project page (/projects/[id]).
 * Time is the information architecture: Done (changelog + runs), Now
 * (live state + brief), Next (resume state + goals). Everything renders
 * from the ProjectDossier SSOT assembly — no client fetches, no parallel
 * state; the quick-edit drawer (/projects?open=) stays the mutation surface.
 */
import Link from "next/link";
import type { ProjectDossier, ProjectRunRow } from "@/db/queries/project-dossier";
import type { DevLogEntry } from "@/db/schema/user-projects";
import { DevLogList } from "@/components/shared/DevLogList";
import { GoalProgressBar } from "@/components/shared/GoalProgressBar";
import { GoalEditor } from "@/components/projects/GoalEditor";
import { timeAgo } from "@/lib/dates";
import { APP_LOCALE } from "@/lib/constants";

const OUTCOME_TAG: Record<string, string> = {
  success: "ui-tag ui-tag-positive",
  partial: "ui-tag ui-tag-warning",
  user_abort: "ui-tag ui-tag-warning",
  error: "ui-tag ui-tag-negative",
  hang: "ui-tag ui-tag-negative",
  timeout: "ui-tag ui-tag-negative",
};

function SectionShell({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="ui-card-shell p-4 sm:p-5 space-y-3">
      <div>
        <p className="ui-kicker">{kicker}</p>
        <h2 className="font-medium text-text-primary">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function runDuration(run: ProjectRunRow): string | null {
  if (!run.finishedAt) return null;
  const mins = Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 60_000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** NOW — live session state + the latest handoff's health signals + brief. */
export function NowSection({ dossier, interactive = true }: { dossier: ProjectDossier; interactive?: boolean }) {
  const { state, detail } = dossier;
  const attrs = detail.attrs;
  const latest = latestDevLog(dossier);

  const liveLabel = state?.agentRunning
    ? state.currentPromptLabel
      ? `Working — ${state.currentPromptLabel}`
      : "Agent process running"
    : state?.sessionStatus === "ready"
      ? "Ready for the next task"
      : "No live agent";

  const briefRows: Array<[string, string]> = (
    [
      ["Mission", attrs.mission],
      ["Stack", attrs.stack],
      ["Status", attrs.status],
    ] as Array<[string, string | undefined]>
  ).filter((row): row is [string, string] => Boolean(row[1]));

  const goalMaxTurns = (() => {
    const n = parseInt(attrs.goal_max_turns ?? "", 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : null;
  })();

  return (
    <SectionShell kicker="Now" title="Status quo">
      <div className="space-y-1.5">
        <p className="text-sm text-text-primary">
          <span className={state?.agentRunning ? "ui-dot ui-dot-positive mr-1.5" : "ui-dot ui-dot-neutral mr-1.5"} aria-hidden="true" />
          {liveLabel}
          {state?.sessionUpdatedAt && (
            <span className="text-xs text-text-muted"> · handoff {timeAgo(state.sessionUpdatedAt.getTime())}</span>
          )}
        </p>
        {latest && (latest.tests || latest.health) && (
          <p className="text-xs text-text-muted">
            Last checks: {[latest.tests, latest.todos ? `${latest.todos} TODOs` : null, latest.health ? `health ${latest.health}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
      <dl className="space-y-2 border-t border-border-subtle pt-3">
        {briefRows.map(([label, value]) => (
          <div key={label}>
            <dt className="ui-micro-label">{label}</dt>
            <dd className="text-sm leading-relaxed text-text-secondary">{value}</dd>
          </div>
        ))}
        {interactive && (
          <GoalEditor
            projectKey={detail.project.name}
            definitionOfDone={attrs.definition_of_done ?? null}
            maxTurns={goalMaxTurns}
          />
        )}
      </dl>
    </SectionShell>
  );
}

/** NEXT — the resume state from the latest handoff + linked goals. */
export function NextSection({ dossier, interactive = true }: { dossier: ProjectDossier; interactive?: boolean }) {
  const latest = latestDevLog(dossier);
  const next = latest?.next?.trim() || dossier.detail.attrs.next_step?.trim() || null;
  const goals = dossier.detail.linkedGoals;

  return (
    <SectionShell kicker="Next" title="What happens next">
      {next ? (
        <p className="text-sm leading-relaxed text-text-primary">
          <span className="font-medium text-accent-text">→ </span>
          {next}
        </p>
      ) : (
        <p className="text-sm text-text-muted">No queued next step — dispatch one from Control.</p>
      )}
      {goals.length > 0 && (
        <div className="space-y-2.5 border-t border-border-subtle pt-3">
          {goals.map((goal) => (
            <div key={goal.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-text-secondary">{goal.title}</span>
                <span className="text-xs text-text-muted">{goal.progress ?? 0}%</span>
              </div>
              <GoalProgressBar value={goal.progress ?? 0} />
            </div>
          ))}
        </div>
      )}
      {interactive && (
        <div className="pt-1">
          <Link href="/control" className="ui-btn-secondary inline-flex">
            Dispatch from Control
          </Link>
        </div>
      )}
    </SectionShell>
  );
}

/** DONE — the report: changelog (dev log) + run history with outcomes/commits. */
export function DoneSection({ dossier }: { dossier: ProjectDossier }) {
  const entries = devLogNewestFirst(dossier);
  const runs = dossier.runs.filter((run) => run.finishedAt);
  // Cap the inline list: a dossier once buried its shipped changelog under
  // ~30 stale timeout rows from the box-credential outage. Show the recent few;
  // the full timeline lives one click away in Activity.
  const RUN_HISTORY_LIMIT = 6;
  const shownRuns = runs.slice(0, RUN_HISTORY_LIMIT);
  const hiddenRunCount = runs.length - shownRuns.length;

  return (
    <SectionShell kicker="Done" title="Report — what has shipped">
      {entries.length === 0 && runs.length === 0 && (
        <p className="text-sm text-text-muted">
          Nothing recorded yet. Dispatches and finished agent sessions land here automatically.
        </p>
      )}
      {entries.length > 0 && (
        <div className="space-y-2">
          <p className="ui-micro-label">Changelog</p>
          <DevLogList entries={entries} />
        </div>
      )}
      {runs.length > 0 && (
        <div className="space-y-2 border-t border-border-subtle pt-3">
          <p className="ui-micro-label">Run history</p>
          <ul className="space-y-1.5">
            {shownRuns.map((run) => {
              const commit = run.summary?.commit && run.summary.commit !== "none" ? run.summary.commit : null;
              const errorText = typeof run.payload?.error === "string" ? run.payload.error : null;
              return (
                <li key={run.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                  <span className="text-text-muted tabular-nums">
                    {run.startedAt.toLocaleDateString(APP_LOCALE, { month: "short", day: "numeric" })}
                  </span>
                  <span className={OUTCOME_TAG[run.outcome ?? ""] ?? "ui-tag ui-tag-neutral"}>{run.outcome ?? run.state}</span>
                  <span className="text-text-secondary">{run.intent}</span>
                  {commit && <span className="font-mono text-text-tertiary">{commit}</span>}
                  {runDuration(run) && <span className="text-text-muted">{runDuration(run)}</span>}
                  {run.outcome !== "success" && errorText && (
                    <span className="w-full truncate text-text-muted">{errorText}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <Link
            href={`/activity?window=month&project=${encodeURIComponent(dossier.detail.project.name)}`}
            className="inline-block text-xs text-accent-text underline-offset-2 hover:underline"
          >
            {hiddenRunCount > 0 ? `Full activity timeline (${hiddenRunCount} more)` : "Full activity timeline"}
          </Link>
        </div>
      )}
    </SectionShell>
  );
}

function devLogNewestFirst(dossier: ProjectDossier): DevLogEntry[] {
  return [...((dossier.detail.devLog ?? []) as DevLogEntry[])].reverse();
}

function latestDevLog(dossier: ProjectDossier): DevLogEntry | null {
  return devLogNewestFirst(dossier)[0] ?? null;
}
