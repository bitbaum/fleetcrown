"use client";

import { ArrowRight, GitBranch, Globe } from "lucide-react";
import { IvyDispatchButton } from "@/components/shared/IvyDispatchButton";
import {
  MaturityBar,
  StatusBadge,
  HealthBadge,
  getHealthSignals,
} from "./project-badges";
import { getProjectLinks, RESERVED } from "./project-detail-types";
import { buildProjectIvyPrompt } from "@/lib/ivy-prompts";

/**
 * Project metadata as the grid view consumes it. Source-of-truth shape
 * comes from getProjects in @/db/queries/projects; ProjectGrid passes
 * each row through unchanged.
 */
export type ProjectGridRow = {
  id: string;
  name: string;
  description: string | null;
  /** Canonical repo URL from entities.git_url (the first-class column).
   *  When present, overrides attrs.repo for the "Open repo" quick link. */
  gitUrl?: string | null;
  attrs: Record<string, string>;
  readonly?: boolean;
  // Surfaced from user_projects via getProjects join so bare-attr tiles can
  // show concrete project context (dir path + preferred agent) instead of
  // just a clickable title.
  dirPath?: string | null;
  agentPref?: string | null;
};

/**
 * Tile rendered for each project in /projects. Click opens ProjectDetail.
 * Lives here instead of inline inside ProjectGrid so the grid file stays
 * focused on filter/search/sort logic, and edits to tile layout don't
 * scroll past the grid surface.
 */
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
  const nextStep = attrs["next_step"] ?? null;
  const signals = getHealthSignals(attrs);
  const hasIssues = signals.length > 0;
  const extraAttrs = Object.entries(attrs).filter(([k]) => !RESERVED.includes(k));

  const ivyPrompt = buildProjectIvyPrompt({ name: project.name, description, attrs });

  return (
    <div
      onClick={onOpen}
      className={`ui-card-shell ui-panel-interactive group relative flex cursor-pointer flex-col gap-3 p-4 sm:p-5 ${
        hasIssues
          ? "border-status-warning/20 bg-status-warning-subtle"
          : "border-border-subtle bg-surface-base"
      }`}
    >
      <div className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-base font-semibold text-text-primary" title={project.name}>{project.name}</div>
            {project.readonly && (
              <span className="ui-kicker shrink-0">team</span>
            )}
          </div>
          {description && (
            <div className="mt-1 line-clamp-2 text-sm leading-relaxed text-text-secondary" title={description}>
              {description}
            </div>
          )}
        </div>

        <div className="ui-card-actions shrink-0 self-start">
          <div onClick={(e) => e.stopPropagation()}>
            <IvyDispatchButton
              prompt={ivyPrompt}
              title="Ask Ivy about this project"
              className="ui-icon-action min-h-8 min-w-8 rounded-lg p-1.5 text-text-muted hover:text-status-positive"
            />
          </div>
          {prodUrl && (
            <a
              href={prodUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ui-icon-action min-h-8 min-w-8 rounded-lg p-1.5"
              title="Open production site"
            >
              <Globe className="h-3.5 w-3.5" />
            </a>
          )}
          {repo && (
            <a
              href={repo}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ui-icon-action min-h-8 min-w-8 rounded-lg p-1.5"
              title="Open repo"
            >
              <GitBranch className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {(status || maturity) && (
        <div className="flex flex-col gap-1.5">
          {status && <StatusBadge value={status} />}
          {maturity && <MaturityBar value={maturity} />}
        </div>
      )}

      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signals.map((s) => (
            <HealthBadge key={s.kind} signal={s} />
          ))}
        </div>
      )}

      {nextStep && (
        <div className="flex items-start gap-1.5 rounded-md border border-status-positive/20 bg-status-positive-subtle px-2.5 py-2">
          <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-status-positive/70" />
          <span className="text-xs text-text-secondary leading-relaxed line-clamp-2">{nextStep}</span>
        </div>
      )}

      {!status && !maturity && !hasIssues && !nextStep && extraAttrs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {extraAttrs.slice(0, 2).map(([key, value]) => (
            <span key={key} title={`${key}: ${value}`} className="ui-micro-badge rounded-full border-border-default bg-surface-overlay text-text-tertiary">
              {String(value).slice(0, 30)}
            </span>
          ))}
        </div>
      )}
      {/* dirPath + agentPref from the user_projects join — runtime metadata
          that adds context regardless of whether the user has filled status /
          description / maturity. eae42d9 originally gated this on "no other
          metadata," but a live audit found almost every project has a
          description, so the chips never rendered in practice. Now render
          whenever either field is set; subordinate styling (muted color,
          micro size) keeps it from competing with primary content. */}
      {(project.dirPath || project.agentPref) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-tertiary">
          {project.dirPath && (
            <code className="truncate rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-micro" title={project.dirPath}>
              {project.dirPath.replace(/^.*\/([^/]+\/[^/]+)$/, "$1")}
            </code>
          )}
          {project.agentPref && (
            <span className="ui-micro-badge rounded-full border-border-default bg-surface-overlay">
              {project.agentPref}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
