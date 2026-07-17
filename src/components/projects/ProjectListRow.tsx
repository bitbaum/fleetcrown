"use client";

import Link from "next/link";
import { ChevronRight, ArrowRight } from "lucide-react";
import { StatusBadge, getHealthSignals } from "./project-badges";
import { shortProjectStatus } from "@/lib/projects-display";
import type { ProjectGridRow } from "./ProjectGridCard";
import { cn } from "@/lib/utils";
import { deriveProjectLoopReadiness } from "@/lib/project-loop-readiness";

export function ProjectListRow({
  project,
}: {
  project: ProjectGridRow;
}) {
  const { attrs } = project;
  const status = attrs["status"];
  const statusLabel = shortProjectStatus(status);
  const nextStep = attrs["next_step"]?.trim() ?? null;
  const description = project.description ?? attrs["description"] ?? null;
  const signals = getHealthSignals(attrs);
  const line = nextStep ?? description;
  const loopReadiness = deriveProjectLoopReadiness(project);

  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        "ui-projects-row group flex w-full min-h-11 items-center gap-3",
        signals.length > 0 && "ui-projects-row-flagged",
      )}
      aria-label={`Open ${project.name}`}
    >
      <div className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-text-primary">{project.name}</span>
          {project.readonly && <span className="ui-projects-badge shrink-0">Team</span>}
          {statusLabel && <StatusBadge value={statusLabel} />}
          {loopReadiness.state !== "ready" && (
            <span
              className="ui-projects-badge hidden border-status-warning/30 bg-status-warning/[0.08] text-status-warning sm:inline-flex"
              title={loopReadiness.description}
            >
              {loopReadiness.label}
            </span>
          )}
        </div>
        {line && (
          <p className="mt-0.5 flex items-start gap-1.5 truncate text-xs text-text-tertiary">
            {nextStep && <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-status-positive" aria-hidden="true" />}
            <span className="truncate">{line}</span>
          </p>
        )}
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text-secondary"
        aria-hidden="true"
      />
    </Link>
  );
}
