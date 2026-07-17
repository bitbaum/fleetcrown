import Link from "next/link";
import { ArrowLeft, ExternalLink, GitBranch, Globe } from "lucide-react";
import type { ProjectDossier } from "@/db/queries/project-dossier";
import { ProjectWorkspaceHeader } from "./ProjectWorkspaceHeader";
import { ProjectContextEditor } from "./ProjectContextEditor";
import { ProjectPlanSection } from "./ProjectPlanSection";
import { ProjectSettingsPanel } from "./ProjectSettingsPanel";
import { DoneSection, NextSection, NowSection } from "./ProjectDossierSections";
import { OrangeCatPublishButton } from "./OrangeCatPublishButton";
import { getProjectLinks } from "./project-detail-types";
import { getHealthSignals, HEALTH_SIGNAL_CONFIG } from "./project-badges";
import { computeProjectHealth } from "@/lib/project-health";
import { FixSignalButton } from "./ProjectActionButtons";
import { AssistantContextBridge } from "./AssistantContextBridge";

const SECTIONS = [
  { href: "#overview", label: "Overview" },
  { href: "#context", label: "Context" },
  { href: "#plan", label: "Plan" },
  { href: "#activity", label: "Activity" },
] as const;

export function ProjectWorkspaceView({
  dossier,
  shareAction,
}: {
  dossier: ProjectDossier;
  shareAction?: React.ReactNode;
}) {
  const { detail, userProject } = dossier;
  const project = detail.project;
  const attrs = detail.attrs;
  const workspaceKey = userProject?.name ?? project.name;
  const links = getProjectLinks(attrs, userProject?.gitUrl ?? project.gitUrl);
  const healthSignals = getHealthSignals(attrs);
  const health = computeProjectHealth({
    description: project.description,
    gitUrl: userProject?.gitUrl ?? project.gitUrl,
    dirPath: userProject?.dirPath,
    attrs,
  });
  // ≥2 consecutive most-recent finished runs timing out is a pattern worth a
  // one-click diagnosis, not something the user should discover by scrolling.
  const finishedRuns = dossier.runs.filter((run) => run.finishedAt);
  let timeoutStreak = 0;
  for (const run of finishedRuns) {
    if (run.outcome !== "timeout") break;
    timeoutStreak += 1;
  }
  const latestDevLogEntry = [...(detail.devLog ?? [])].reverse()[0] ?? null;
  const nextStep = latestDevLogEntry?.next?.trim() || attrs.next_step?.trim() || null;

  return (
    <div className="app-page max-w-5xl space-y-6">
      <AssistantContextBridge
        context={{
          projectId: project.id,
          name: project.name,
          workspaceKey,
          signals: healthSignals.map((signal) => ({
            key: HEALTH_SIGNAL_CONFIG.find((c) => c.kind === signal.kind)?.key ?? signal.kind,
            label: signal.label,
            value: signal.value,
          })),
          nextStep,
          timeoutStreak,
          readonly: dossier.readonly,
        }}
      />
      <Link
        href="/projects"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All projects
      </Link>

      <header className="border-b border-border-subtle pb-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <ProjectWorkspaceHeader
            projectId={project.id}
            name={project.name}
            workspaceKey={workspaceKey}
            description={project.description}
            status={attrs.status ?? null}
            health={health}
            readonly={dossier.readonly}
          />
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {links.prodUrl && (
              <a href={links.prodUrl} target="_blank" rel="noreferrer" className="ui-btn-secondary min-h-11 gap-1.5">
                <Globe className="h-4 w-4" aria-hidden="true" /> Live
              </a>
            )}
            {links.repo && (
              <a href={links.repo} target="_blank" rel="noreferrer" className="ui-btn-secondary min-h-11 gap-1.5">
                <GitBranch className="h-4 w-4" aria-hidden="true" /> Repository
              </a>
            )}
            {!dossier.readonly && <OrangeCatPublishButton projectId={project.id} />}
            {userProject?.orangecatProjectId && (
              <a
                href={`https://orangecat.ch/projects/${userProject.orangecatProjectId}`}
                target="_blank"
                rel="noreferrer"
                className="ui-icon-action min-h-11 min-w-11"
                title="Open on OrangeCat"
                aria-label="Open project on OrangeCat"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {shareAction}
          </div>
        </div>
      </header>

      <nav
        aria-label="Project profile sections"
        className="sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto border-y border-border-subtle bg-surface-page/95 px-4 py-2 backdrop-blur-sm sm:mx-0 sm:rounded-lg sm:border sm:px-2"
      >
        {SECTIONS.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary sm:min-h-9"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <section id="overview" className="scroll-mt-28" aria-labelledby="project-overview-title">
        <h2 id="project-overview-title" className="sr-only">Overview</h2>
        {healthSignals.length > 0 && (
          <div className="mb-5 divide-y divide-border-subtle border-y border-border-subtle">
            {healthSignals.map((signal) => {
              const signalKey = HEALTH_SIGNAL_CONFIG.find((c) => c.kind === signal.kind)?.key;
              return (
                <div key={signal.kind} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="shrink-0 text-sm font-medium text-status-warning">{signal.label}</span>
                  <span className="flex-1 text-sm leading-relaxed text-text-secondary">{signal.value}</span>
                  {!dossier.readonly && signalKey && (
                    <FixSignalButton projectId={project.id} workspaceKey={workspaceKey} signalKey={signalKey} />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          <NowSection dossier={dossier} interactive={false} showBrief={false} />
          <NextSection dossier={dossier} interactive={false} showGoals={false} dispatchable={!dossier.readonly} />
        </div>
      </section>

      <ProjectContextEditor
        projectId={project.id}
        projectName={workspaceKey}
        attrs={attrs}
        gitUrl={userProject?.gitUrl ?? project.gitUrl ?? null}
        resources={detail.resources ?? []}
        readonly={dossier.readonly}
      />

      <ProjectPlanSection
        projectId={project.id}
        projectName={project.name}
        attrs={attrs}
        goals={detail.linkedGoals}
        readonly={dossier.readonly}
      />

      <section id="activity" className="scroll-mt-28 border-t border-border-subtle pt-7" aria-labelledby="project-activity-title">
        <h2 id="project-activity-title" className="mb-4 text-lg font-semibold text-text-primary">Activity and evidence</h2>
        <DoneSection dossier={dossier} />
      </section>

      {!dossier.readonly && (
        <ProjectSettingsPanel
          projectId={project.id}
          hasRepo={Boolean(links.repo)}
          hasLocalPath={Boolean(userProject?.dirPath)}
        />
      )}
    </div>
  );
}
