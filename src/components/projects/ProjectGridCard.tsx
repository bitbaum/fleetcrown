"use client";

import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import {
  StatusBadge,
  HealthBadge,
  getHealthSignals,
} from "./project-badges";
import { cn } from "@/lib/utils";
import { deriveProjectLoopReadiness } from "@/lib/project-loop-readiness";
import { computeProjectHealth } from "@/lib/project-health";
import { HealthScoreBar } from "./HealthScore";
import { answer, cleanDescription } from "@/lib/project-display";

export type ProjectGridRow = {
  id: string;
  name: string;
  description: string | null;
  gitUrl?: string | null;
  attrs: Record<string, string>;
  readonly?: boolean;
  dirPath?: string | null;
  agentPref?: string | null;
};

export function ProjectGridCard({
  project,
}: {
  project: ProjectGridRow;
}) {
  const { attrs } = project;
  const description = cleanDescription(project.description) ?? answer(attrs["description"]);
  const health = computeProjectHealth({
    description: project.description,
    gitUrl: project.gitUrl,
    dirPath: project.dirPath,
    attrs,
  });
  const status = attrs["status"];
  const nextStep = answer(attrs["next_step"]);
  const signals = getHealthSignals(attrs);
  const hasIssues = signals.length > 0;
  const loopReadiness = deriveProjectLoopReadiness(project);

  return (
    <article
      className={cn(
        "ui-projects-card group",
        hasIssues && "ui-projects-card-attention",
      )}
    >
      <Link
        href={`/projects/${project.id}`}
        className="ui-projects-card-main"
        aria-label={`Open ${project.name} profile`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-text-primary">{project.name}</h3>
              {project.readonly && <span className="ui-projects-badge shrink-0">Team</span>}
              {status && <StatusBadge value={status} />}
              {/* Only the EXCEPTIONS earn a badge. "Loop-ready" sat on 19/19
                  projects — a label everything carries filters nothing. Show
                  the chip only when something needs the user (no path / paused). */}
              {loopReadiness.state !== "ready" && (
                <span
                  className="ui-projects-badge border-status-warning/30 bg-status-warning/[0.08] text-status-warning"
                  title={loopReadiness.description}
                >
                  {loopReadiness.label}
                </span>
              )}
            </div>
            {description ? (
              <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-text-secondary">{description}</p>
            ) : null}
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text-secondary" aria-hidden="true" />
        </div>

        <div className="mt-3">
          <HealthScoreBar health={health} />
        </div>

        {signals.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {signals.map((s) => (
              <HealthBadge key={s.kind} signal={s} />
            ))}
          </div>
        )}

        {nextStep && (
          <div className="ui-projects-next-step">
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-status-positive" aria-hidden="true" />
            <span className="line-clamp-2 text-left text-xs leading-relaxed text-text-secondary">{nextStep}</span>
          </div>
        )}

      </Link>
    </article>
  );
}
