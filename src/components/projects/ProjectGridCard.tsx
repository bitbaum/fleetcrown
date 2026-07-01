"use client";

import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  GitBranch,
  Globe,
  Terminal,
} from "lucide-react";
import { LokiDispatchButton } from "@/components/shared/LokiDispatchButton";
import {
  MaturityBar,
  StatusBadge,
  HealthBadge,
  getHealthSignals,
} from "./project-badges";
import { getProjectLinks } from "./project-detail-types";
import { buildProjectLokiPrompt } from "@/lib/loki-prompts";
import { NAV } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { deriveProjectLoopReadiness } from "@/lib/project-loop-readiness";

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
  onOpen,
}: {
  project: ProjectGridRow;
  onOpen: () => void;
}) {
  const { attrs } = project;
  const description = project.description ?? attrs["description"] ?? null;
  const { prodUrl, repo } = getProjectLinks(attrs, project.gitUrl);
  const maturity = attrs["maturity"];
  const status = attrs["status"];
  const nextStep = attrs["next_step"]?.trim() ?? null;
  const signals = getHealthSignals(attrs);
  const hasIssues = signals.length > 0;
  const lokiPrompt = buildProjectLokiPrompt({ name: project.name, description, attrs });
  const loopReadiness = deriveProjectLoopReadiness(project);

  return (
    <article
      className={cn(
        "ui-projects-card group",
        hasIssues && "ui-projects-card-attention",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="ui-projects-card-main"
        aria-label={`Open ${project.name} profile`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-text-primary">{project.name}</h3>
              {project.readonly && <span className="ui-kicker shrink-0">team</span>}
              {status && <StatusBadge value={status} />}
              <span
                className={cn(
                  "ui-micro-badge rounded-full",
                  loopReadiness.tone === "positive"
                    ? "border-status-positive/25 bg-status-positive/[0.08] text-status-positive"
                    : "border-status-warning/30 bg-status-warning/[0.08] text-status-warning",
                )}
                title={loopReadiness.description}
              >
                {loopReadiness.label}
              </span>
            </div>
            {description ? (
              <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-text-secondary">{description}</p>
            ) : null}
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text-secondary" aria-hidden="true" />
        </div>

        {maturity && (
          <div className="mt-3">
            <MaturityBar value={maturity} />
          </div>
        )}

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

        {(project.dirPath || project.agentPref || loopReadiness.reason === "no_path") && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
            {project.dirPath && (
              <code className="truncate rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-micro" title={project.dirPath}>
                {project.dirPath.replace(/^.*\/([^/]+\/[^/]+)$/, "$1")}
              </code>
            )}
            {!project.dirPath && (
              <span className="ui-micro-badge rounded-full border-status-warning/30 bg-status-warning/[0.08] text-status-warning">
                add local path to run loops
              </span>
            )}
            {project.agentPref && (
              <span className="ui-micro-badge rounded-full border-border-default bg-surface-overlay">{project.agentPref}</span>
            )}
          </div>
        )}
      </button>

      <div className="ui-projects-card-actions">
        {!project.readonly && (
          <Link href={NAV.control.href} className="ui-projects-card-action" onClick={(e) => e.stopPropagation()}>
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
            Control
          </Link>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <LokiDispatchButton
            prompt={lokiPrompt}
            title="Ask Loki about this project"
            className="ui-icon-action min-h-9 min-w-9 rounded-lg p-1.5 text-text-muted hover:text-status-positive"
          />
          {prodUrl && (
            <a
              href={prodUrl}
              target="_blank"
              rel="noreferrer"
              className="ui-icon-action min-h-9 min-w-9 rounded-lg p-1.5"
              title="Open production site"
              aria-label="Open production site"
            >
              <Globe className="h-3.5 w-3.5" />
            </a>
          )}
          {repo && (
            <a
              href={repo}
              target="_blank"
              rel="noreferrer"
              className="ui-icon-action min-h-9 min-w-9 rounded-lg p-1.5"
              title="Open repository"
              aria-label="Open repository"
            >
              <GitBranch className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
