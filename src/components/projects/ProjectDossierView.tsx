import Link from "next/link";
import { ExternalLink, FileText, GitBranch, Globe, Lock, MessageSquare, Target } from "lucide-react";
import type { ProjectDossier } from "@/db/queries/project-dossier";
import type { ProjectShare } from "@/db/schema/project-shares";
import { OutcomeStreak } from "@/components/control/OutcomeStreak";
import { DoneSection, NextSection, NowSection } from "@/components/projects/ProjectDossierSections";
import { getProjectLinks } from "@/components/projects/project-detail-types";
import { cleanDescription } from "@/lib/project-display";
import { isResourceVisibleInShare } from "@/lib/project-share-visibility";
import { NAV } from "@/config/navigation";

type Mode = "private" | "shared";

function visibleResources(dossier: ProjectDossier, mode: Mode, share?: ProjectShare | null) {
  const resources = dossier.detail.resources ?? [];
  if (mode === "private") return resources;
  if (!share?.includeResources) return [];
  return resources.filter((r) => isResourceVisibleInShare(r, share.audience as "advisor" | "team" | "public"));
}

function resourceLabel(kind: string): string {
  return kind.replace(/-/g, " ");
}

export function ProjectDossierView({
  dossier,
  mode,
  share,
  actions,
}: {
  dossier: ProjectDossier;
  mode: Mode;
  share?: ProjectShare | null;
  actions?: React.ReactNode;
}) {
  const { detail, userProject, outcomes } = dossier;
  const attrs = detail.attrs;
  const name = detail.project.name;
  const links = getProjectLinks(attrs, userProject?.gitUrl ?? detail.project.gitUrl);
  const description = cleanDescription(detail.project.description) ?? attrs.description ?? attrs.mission ?? null;
  const resources = visibleResources(dossier, mode, share);
  const showRepo = mode === "private" || share?.includeRepo;
  const showLive = mode === "private" || share?.includeLiveUrl;
  const showRoadmap = mode === "private" || share?.includeRoadmap;
  const showChangelog = mode === "private" || share?.includeChangelog;
  const business = [
    ["Problem", attrs.problem],
    ["Solution", attrs.solution],
    ["Customers", attrs.customers],
    ["Market", attrs.potential_customers],
  ].filter(([, v]) => v?.trim()) as Array<[string, string]>;
  const build = [
    ["Stack", attrs.stack ?? userProject?.stack],
    ["Architecture", attrs.architecture],
    ["Conventions", attrs.conventions],
    ["Definition of done", attrs.definition_of_done],
  ].filter(([, v]) => v?.trim()) as Array<[string, string]>;

  return (
    <div className="space-y-6">
      <section className="space-y-4 border-b border-border-subtle pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {attrs.status && <span className="ui-tag ui-tag-neutral">{attrs.status}</span>}
              {attrs.maturity && <span className="ui-tag ui-tag-neutral">{attrs.maturity}</span>}
              {mode === "shared" && <span className="ui-tag ui-tag-neutral gap-1"><Lock className="h-3 w-3" /> Shared dossier</span>}
              {outcomes.length > 0 && mode === "private" && (
                <OutcomeStreak outcomes={outcomes.map((o) => o.outcome)} projectKey={name} />
              )}
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-text-primary">{name}</h1>
            {description && <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">{description}</p>}
          </div>
          {actions}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {showLive && links.prodUrl && (
            <a href={links.prodUrl} target="_blank" rel="noopener noreferrer" className="ui-btn-secondary gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Live
            </a>
          )}
          {showRepo && links.repo && (
            <a href={links.repo} target="_blank" rel="noopener noreferrer" className="ui-btn-secondary gap-1.5">
              <GitBranch className="h-3.5 w-3.5" /> Repository
            </a>
          )}
          {mode === "private" && userProject?.orangecatProjectId && (
            <a href={`https://orangecat.ch/projects/${userProject.orangecatProjectId}`} target="_blank" rel="noopener noreferrer" className="ui-btn-secondary gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> OrangeCat
            </a>
          )}
          {mode === "private" && (
            <>
              <Link href={NAV.control.href} className="ui-btn-secondary">Control</Link>
              <Link href={`/projects?open=${detail.project.id}`} className="ui-btn-secondary">Quick edit</Link>
            </>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <NowSection dossier={dossier} interactive={mode === "private"} />
        {showRoadmap ? <NextSection dossier={dossier} interactive={mode === "private"} /> : (
          <section className="ui-card-shell p-4 sm:p-5">
            <p className="ui-kicker">Next</p>
            <h2 className="font-medium text-text-primary">Roadmap hidden</h2>
            <p className="mt-2 text-sm text-text-muted">This shared view does not include roadmap details.</p>
          </section>
        )}
      </div>

      {(business.length > 0 || build.length > 0) && (
        <section className="grid gap-5 md:grid-cols-2">
          {business.length > 0 && (
            <div className="ui-card-shell p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-accent-text" />
                <h2 className="font-medium text-text-primary">Why it matters</h2>
              </div>
              {business.map(([label, value]) => (
                <div key={label}>
                  <p className="ui-micro-label">{label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">{value}</p>
                </div>
              ))}
            </div>
          )}
          {build.length > 0 && (
            <div className="ui-card-shell p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-accent-text" />
                <h2 className="font-medium text-text-primary">Technology</h2>
              </div>
              {build.map(([label, value]) => (
                <div key={label}>
                  <p className="ui-micro-label">{label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">{value}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {resources.length > 0 && (
        <section className="ui-card-shell p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent-text" />
            <h2 className="font-medium text-text-primary">Resources</h2>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {resources.map((resource) => (
              <div key={resource.id} className="rounded-lg border border-border-subtle bg-surface-raised p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="ui-micro-badge">{resourceLabel(resource.kind)}</span>
                  <span className="ui-micro-badge">{resource.visibility ?? "private"}</span>
                  {resource.url ? (
                    <a href={resource.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm text-accent-text hover:underline">
                      {resource.title}
                    </a>
                  ) : (
                    <span className="min-w-0 truncate text-sm text-text-primary">{resource.title}</span>
                  )}
                </div>
                {resource.notes && <p className="text-xs leading-relaxed text-text-muted">{resource.notes}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {mode === "private" && (
        <section className="ui-card-shell p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-accent-text" />
            <h2 className="font-medium text-text-primary">Discuss with Loki</h2>
          </div>
          <p className="text-sm text-text-secondary">Use Quick edit to open the project-scoped Loki chat with the same dossier context agents receive.</p>
        </section>
      )}

      {showChangelog && <DoneSection dossier={dossier} />}
    </div>
  );
}
