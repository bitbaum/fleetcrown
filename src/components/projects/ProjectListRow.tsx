"use client";

import { ChevronRight, ArrowRight } from "lucide-react";
import { StatusBadge, getHealthSignals } from "./project-badges";
import { shortProjectStatus } from "@/lib/projects-display";
import type { ProjectGridRow } from "./ProjectGridCard";
import { cn } from "@/lib/utils";

export function ProjectListRow({
  project,
  onOpen,
}: {
  project: ProjectGridRow;
  onOpen: () => void;
}) {
  const { attrs } = project;
  const status = attrs["status"];
  const statusLabel = shortProjectStatus(status);
  const nextStep = attrs["next_step"]?.trim() ?? null;
  const description = project.description ?? attrs["description"] ?? null;
  const signals = getHealthSignals(attrs);
  const line = nextStep ?? description;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "ui-projects-row group flex w-full min-h-11 items-center gap-3",
        signals.length > 0 && "ui-projects-row-flagged",
      )}
      aria-label={`Open ${project.name}`}
    >
      <div className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-text-primary">{project.name}</span>
          {project.readonly && <span className="ui-kicker shrink-0">team</span>}
          {statusLabel && <StatusBadge value={statusLabel} />}
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
    </button>
  );
}
