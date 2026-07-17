"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Plus } from "lucide-react";
import { ProjectBriefFill } from "./ProjectBriefFill";
import { ProjectDocSync } from "./ProjectDocSync";
import { ProjectResources } from "./ProjectResources";
import { BusinessPlanSection } from "./BusinessPlanSection";
import { AddAttrInline, AttrRow } from "./project-overview-helpers";
import { getProjectLinks, type ProjectResource } from "./project-detail-types";

const CONTEXT_GROUPS = [
  {
    title: "Purpose",
    fields: [
      { key: "mission", label: "Mission", placeholder: "Why this project exists now" },
      { key: "vision", label: "Vision", placeholder: "The future this project should create" },
      { key: "customers", label: "People served", placeholder: "Who uses it and what they need" },
    ],
  },
  {
    title: "Product",
    fields: [
      { key: "problem", label: "Problem", placeholder: "The concrete problem worth solving" },
      { key: "solution", label: "Solution", placeholder: "How this project solves the problem" },
    ],
  },
  {
    title: "Build contract",
    fields: [
      { key: "stack", label: "Stack", placeholder: "Languages, frameworks, and infrastructure" },
      { key: "architecture", label: "Architecture", placeholder: "Main modules, stores, and integrations" },
      { key: "conventions", label: "Conventions", placeholder: "Patterns and rules every agent must follow" },
    ],
  },
] as const;

const CONTEXT_KEYS = new Set<string>(CONTEXT_GROUPS.flatMap((group) => group.fields.map((field) => field.key)));
const NON_CONTEXT_KEYS = new Set<string>([
  "status", "maturity", "next_step", "definition_of_done", "goal_max_turns",
  "description", "owner", "production_url", "url", "repo", "github_repo",
  "security_vulnerability", "broken_features", "deployment_issue",
  "business_plan", "business_actions", "business_plan_updated_at",
]);

export function ProjectContextEditor({
  projectId,
  projectName,
  attrs,
  gitUrl,
  resources,
  readonly,
}: {
  projectId: string;
  projectName: string;
  attrs: Record<string, string>;
  gitUrl: string | null;
  resources: ProjectResource[];
  readonly: boolean;
}) {
  const router = useRouter();
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const editable = !readonly;
  const refresh = () => router.refresh();
  const fieldCount = CONTEXT_GROUPS.reduce((total, group) => total + group.fields.length, 0);
  const filledCount = CONTEXT_GROUPS.reduce(
    (total, group) => total + group.fields.filter((field) => attrs[field.key]?.trim()).length,
    0,
  );
  const extraAttrs = useMemo(
    () => Object.entries(attrs).filter(([key, value]) =>
      value?.trim() && !CONTEXT_KEYS.has(key) && !NON_CONTEXT_KEYS.has(key),
    ),
    [attrs],
  );
  const hasRepo = getProjectLinks(attrs, gitUrl).repo !== null;

  return (
    <section id="context" className="scroll-mt-28 border-t border-border-subtle pt-7" aria-labelledby="project-context-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-accent-text" aria-hidden="true" />
            <h2 id="project-context-title" className="text-lg font-semibold text-text-primary">Agent context</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Exact project context · {filledCount}/{fieldCount} core fields complete
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <ProjectBriefFill projectId={projectId} hasRepo={hasRepo} onReload={refresh} />
            <ProjectDocSync projectId={projectId} onReload={refresh} />
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-x-8 gap-y-7 lg:grid-cols-2">
        {CONTEXT_GROUPS.map((group) => (
          <section key={group.title} className={group.title === "Build contract" ? "lg:col-span-2" : undefined}>
            <h3 className="ui-projects-section-label mb-1">{group.title}</h3>
            <div className="border-y border-border-subtle">
              {group.fields.map((field) => {
                const value = attrs[field.key]?.trim();
                if (value) {
                  return (
                    <AttrRow
                      key={field.key}
                      label={field.label}
                      value={value}
                      projectId={projectId}
                      attrKey={field.key}
                      placeholder={field.placeholder}
                      editable={editable}
                      onReload={refresh}
                    />
                  );
                }
                if (!editable) return null;
                return (
                  <div key={field.key} className="border-b border-border-subtle py-2 last:border-0">
                    {addingKey === field.key ? (
                      <AddAttrInline
                        projectId={projectId}
                        presetKey={field.key}
                        presetPlaceholder={field.placeholder}
                        onSaved={() => { setAddingKey(null); refresh(); }}
                        onCancel={() => setAddingKey(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingKey(field.key)}
                        className="flex min-h-11 w-full items-center gap-2 text-left text-sm text-text-tertiary transition-colors hover:text-text-primary"
                      >
                        <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="font-medium">{field.label}</span>
                        <span className="hidden truncate text-text-muted sm:inline">{field.placeholder}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {extraAttrs.length > 0 && (
        <details className="mt-6 border-y border-border-subtle">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-text-secondary">
            Additional context ({extraAttrs.length})
          </summary>
          <div className="border-t border-border-subtle pb-1">
            {extraAttrs.map(([key, value]) => (
              <AttrRow
                key={key}
                label={key.replace(/_/g, " ")}
                value={value}
                projectId={projectId}
                attrKey={key}
                editable={editable}
                onReload={refresh}
              />
            ))}
          </div>
        </details>
      )}

      <div className="mt-7">
        <ProjectResources
          projectId={projectId}
          resources={resources}
          editable={editable}
          onReload={refresh}
        />
      </div>

      <div className="mt-7">
        <BusinessPlanSection
          attrs={attrs}
          projectId={projectId}
          projectName={projectName}
          editable={editable}
          onReload={refresh}
          showMarketLens={false}
        />
      </div>
    </section>
  );
}
