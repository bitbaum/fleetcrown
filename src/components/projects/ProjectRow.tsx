"use client";

import Link from "next/link";
import { ChevronRight, ArrowRight } from "lucide-react";
import { StatusBadge, HealthBadge, getHealthSignals } from "./project-badges";
import { shortProjectStatus } from "@/lib/projects-display";
import type { ProjectGridRow } from "./project-grid-row";
import { cn } from "@/lib/utils";
import { deriveProjectLoopReadiness } from "@/lib/project-loop-readiness";
import { computeProjectHealth } from "@/lib/project-health";
import { HealthScoreBar } from "./HealthScore";
import { answer, cleanDescription } from "@/lib/project-display";
import { timeAgo } from "@/lib/dates";

/**
 * THE project row — every project renders through this one shape. The old
 * page bifurcated on a boolean: flagged projects became fat two-column cards,
 * everything else a bare 44px line, so the same object had two incompatible
 * looks and the list read as two unrelated widgets. One row, one grammar:
 * identity + badges on line one, the one context line under it, and a quiet
 * right-hand meta column (health, recency, open feedback) that answers "what
 * moved?" without opening the project.
 */
export function ProjectRow({
  project,
  lastDispatchAt,
  feedbackOpen,
}: {
  project: ProjectGridRow;
  /** Newest non-smoke dispatch for this project, ISO — null = never. */
  lastDispatchAt?: string | null;
  /** Open (new + dispatched) feedback items for this project. */
  feedbackOpen?: number;
}) {
  const { attrs } = project;
  const status = attrs["status"];
  const statusLabel = shortProjectStatus(status);
  const nextStep = answer(attrs["next_step"]);
  const description = cleanDescription(project.description) ?? answer(attrs["description"]);
  const signals = getHealthSignals(attrs);
  const siteDown = Boolean(project.liveUrl) && project.siteOk === false;
  const flagged = signals.length > 0 || siteDown;
  const line = nextStep ?? description;
  const loopReadiness = deriveProjectLoopReadiness(project);
  const health = computeProjectHealth({
    description: project.description,
    gitUrl: project.gitUrl,
    dirPath: project.dirPath,
    liveUrl: project.liveUrl,
    attrs,
  });

  const recency = lastDispatchAt
    ? `active ${timeAgo(new Date(lastDispatchAt).getTime())}`
    : "no runs yet";

  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        "ui-projects-row group flex w-full min-h-11 items-center gap-3",
        flagged && "ui-projects-row-flagged",
      )}
      aria-label={`Open ${project.name}`}
    >
      <div className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-text-primary">{project.name}</span>
          {project.readonly && <span className="ui-projects-badge shrink-0">Team</span>}
          {statusLabel && <StatusBadge value={statusLabel} />}
          {siteDown && <span className="ui-projects-badge ui-projects-badge-negative">Down</span>}
          {signals.map((s) => (
            <HealthBadge key={s.kind} signal={s} />
          ))}
          {loopReadiness.state !== "ready" && (
            <span
              className="ui-projects-badge ui-projects-badge-warning hidden sm:inline-flex"
              title={loopReadiness.description}
            >
              {loopReadiness.label}
            </span>
          )}
        </div>
        {line && (
          <p className="mt-0.5 flex items-start gap-1.5 truncate text-xs text-text-tertiary">
            {nextStep && (
              <ArrowRight
                className="mt-0.5 h-3 w-3 shrink-0 text-status-positive"
                aria-hidden="true"
              />
            )}
            <span className="truncate">{line}</span>
          </p>
        )}
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
        <HealthScoreBar health={health} />
        <span className="text-micro text-text-muted">
          {recency}
          {feedbackOpen ? ` · ${feedbackOpen} feedback` : ""}
        </span>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text-secondary"
        aria-hidden="true"
      />
    </Link>
  );
}
