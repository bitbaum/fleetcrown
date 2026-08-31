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
import { PROJECT_ATTR, humanizeAttrKey } from "@/config/project-attrs";
import { answer, hasAnswer } from "@/lib/project-display";

const CONTEXT_GROUPS = [
  {
    title: "Purpose",
    fields: [
      { key: PROJECT_ATTR.MISSION, label: "Mission", placeholder: "Why this project exists now" },
      {
        key: PROJECT_ATTR.VISION,
        label: "Vision",
        placeholder: "The future this project should create",
      },
      {
        key: PROJECT_ATTR.CUSTOMERS,
        label: "People served",
        placeholder: "Who uses it and what they need",
      },
    ],
  },
  {
    title: "Product",
    fields: [
      {
        key: PROJECT_ATTR.PROBLEM,
        label: "Problem",
        placeholder: "The concrete problem worth solving",
      },
      {
        key: PROJECT_ATTR.SOLUTION,
        label: "Solution",
        placeholder: "How this project solves the problem",
      },
    ],
  },
  {
    title: "Reach",
    fields: [
      {
        key: PROJECT_ATTR.DISTRIBUTION,
        label: "Distribution",
        placeholder: "Channels that exist today — RSS, newsletter, social queue, OG cards",
      },
      {
        key: PROJECT_ATTR.GTM,
        label: "Go-to-market",
        placeholder: "ICP, path to first paying customer, monetization state",
      },
    ],
  },
  {
    title: "Build contract",
    fields: [
      {
        key: PROJECT_ATTR.STACK,
        label: "Stack",
        placeholder: "Languages, frameworks, and infrastructure",
      },
      {
        key: PROJECT_ATTR.ARCHITECTURE,
        label: "Architecture",
        placeholder: "Main modules, stores, and integrations",
      },
      {
        key: PROJECT_ATTR.CONVENTIONS,
        label: "Conventions",
        placeholder: "Patterns and rules every agent must follow",
      },
    ],
  },
] as const;

const CONTEXT_KEYS = new Set<string>(
  CONTEXT_GROUPS.flatMap((group) => group.fields.map((field) => field.key)),
);
/** Known attrs that are NOT free-form context — rendered by dedicated UI elsewhere. */
const NON_CONTEXT_KEYS = new Set<string>([
  PROJECT_ATTR.STATUS,
  PROJECT_ATTR.MATURITY,
  PROJECT_ATTR.NEXT_STEP,
  PROJECT_ATTR.DEFINITION_OF_DONE,
  PROJECT_ATTR.GOAL_MAX_TURNS,
  PROJECT_ATTR.DESCRIPTION,
  PROJECT_ATTR.OWNER,
  PROJECT_ATTR.PRODUCTION_URL,
  PROJECT_ATTR.URL,
  PROJECT_ATTR.REPO,
  PROJECT_ATTR.GITHUB_REPO,
  PROJECT_ATTR.SECURITY_VULNERABILITY,
  PROJECT_ATTR.BROKEN_FEATURES,
  PROJECT_ATTR.DEPLOYMENT_ISSUE,
  PROJECT_ATTR.BUSINESS_PLAN,
  PROJECT_ATTR.BUSINESS_ACTIONS,
  PROJECT_ATTR.BUSINESS_PLAN_UPDATED_AT,
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
    (total, group) => total + group.fields.filter((field) => hasAnswer(attrs[field.key])).length,
    0,
  );
  const extraAttrs = useMemo(
    () =>
      Object.entries(attrs).filter(
        ([key, value]) => value?.trim() && !CONTEXT_KEYS.has(key) && !NON_CONTEXT_KEYS.has(key),
      ),
    [attrs],
  );
  const hasRepo = getProjectLinks(attrs, gitUrl).repo !== null;

  return (
    <section id="context" className="ui-project-section" aria-labelledby="project-context-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-accent-text" aria-hidden="true" />
            <h2 id="project-context-title" className="text-lg font-semibold text-text-primary">
              Agent context
            </h2>
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
          <section
            key={group.title}
            className={group.title === "Build contract" ? "lg:col-span-2" : undefined}
          >
            <h3 className="ui-projects-section-label mb-1">{group.title}</h3>
            <div className="border-y border-border-subtle">
              {group.fields.map((field) => {
                const value = answer(attrs[field.key]);
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
                        onSaved={() => {
                          setAddingKey(null);
                          refresh();
                        }}
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
                        <span className="hidden truncate text-text-muted sm:inline">
                          {field.placeholder}
                        </span>
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
                label={humanizeAttrKey(key)}
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
