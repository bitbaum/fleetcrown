import { FileText, GitBranch, Globe, Lock, Target } from "lucide-react";
import type { ProjectDossier } from "@/db/queries/project-dossier";
import type { ProjectShare } from "@/db/schema/project-shares";
import { DoneSection, NextSection, NowSection } from "@/components/projects/ProjectDossierSections";
import { getProjectLinks } from "@/components/projects/project-detail-types";
import { summarizeDescription } from "@/lib/project-display";
import { isResourceVisibleInShare } from "@/lib/project-share-visibility";

function visibleResources(dossier: ProjectDossier, share?: ProjectShare | null) {
  const resources = dossier.detail.resources ?? [];
  if (!share?.includeResources) return [];
  return resources.filter((r) => isResourceVisibleInShare(r, share.audience as "advisor" | "team" | "public"));
}

function resourceLabel(kind: string): string {
  return kind.replace(/-/g, " ");
}

export function ProjectDossierView({
  dossier,
  share,
  actions,
}: {
  dossier: ProjectDossier;
  share?: ProjectShare | null;
  actions?: React.ReactNode;
}) {
  const { detail, userProject } = dossier;
  const attrs = detail.attrs;
  const name = detail.project.name;
  const links = getProjectLinks(attrs, userProject?.gitUrl ?? detail.project.gitUrl, userProject?.liveUrl);
  // Header lead = a SHORT summary. Descriptions are often the whole CLAUDE.md.
  const description =
    summarizeDescription(detail.project.description) ??
    summarizeDescription(attrs.description) ??
    summarizeDescription(attrs.mission);
  const resources = visibleResources(dossier, share);
  const showRepo = share?.includeRepo;
  const showLive = share?.includeLiveUrl;
  const showRoadmap = share?.includeRoadmap;
  const showChangelog = share?.includeChangelog;
  const business = [
    ["Problem", attrs.problem],
    ["Solution", attrs.solution],
    ["Customers", attrs.customers],
    ["Market", attrs.potential_customers],
  ].filter(([, v]) => v?.trim()) as Array<[string, string]>;
  const build = ([
    ["Stack", attrs.stack ?? userProject?.stack],
    ["Architecture", attrs.architecture],
    ["Conventions", attrs.conventions],
    ["Definition of done", attrs.definition_of_done],
  ] as Array<[string, string | undefined]>).filter(([, v]) => v?.trim()) as Array<[string, string]>;

  return (
    <div className="space-y-6">
      <section className="space-y-4 border-b border-border-subtle pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {attrs.status && <span className="ui-tag ui-tag-neutral">{attrs.status}</span>}
              {attrs.maturity && <span className="ui-tag ui-tag-neutral">{attrs.maturity}</span>}
              <span className="ui-tag ui-tag-neutral gap-1"><Lock className="h-3 w-3" /> Shared dossier</span>
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
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <NowSection dossier={dossier} interactive={false} />
        {showRoadmap ? <NextSection dossier={dossier} interactive={false} /> : (
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

      {showChangelog && <DoneSection dossier={dossier} />}
    </div>
  );
}
