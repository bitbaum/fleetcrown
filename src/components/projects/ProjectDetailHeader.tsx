"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Globe, GitBranch, AlertTriangle, Activity } from "lucide-react";
import Link from "next/link";
import { DeleteButton } from "@/components/ui/delete-button";
import { LokiDispatchButton } from "@/components/shared/LokiDispatchButton";
import { setAttr } from "@/lib/api/attrs";
import type { ProjectData, Tab } from "./project-detail-types";
import { getProjectLinks } from "./project-detail-types";
import { HEALTH_SIGNAL_CONFIG } from "./project-badges";
import { NAV } from "@/config/navigation";
import {
  NameEditor,
  DescriptionEditor,
  StatusEditor,
  MaturityEditor,
} from "./ProjectInlineEditors";
import { ProjectDetailTabBar } from "./ProjectDetailTabBar";
import { OrangeCatPublishButton } from "./OrangeCatPublishButton";
import { patchJson, deleteJson, throwApiError } from "@/lib/api/fetch";
import { buildProjectLokiPrompt } from "@/lib/loki-prompts";
import { compactRelativeDate } from "@/lib/dates";

export function ProjectDetailHeader({
  data,
  loading,
  projectId,
  tab,
  setTab,
  onClose,
  onDeleteSuccess,
  jobCount,
  goalCount,
}: {
  data: ProjectData | null;
  loading: boolean;
  projectId: string;
  tab: Tab;
  setTab: (tab: Tab) => void;
  onClose: () => void;
  onDeleteSuccess: () => void;
  jobCount: number;
  goalCount: number;
}) {
  const router = useRouter();
  const [nameOverride, setNameOverride] = useState<string | undefined>();
  const [descOverride, setDescOverride] = useState<string | null | undefined>();
  const [statusOverride, setStatusOverride] = useState<string | undefined>();
  const [maturityOverride, setMaturityOverride] = useState<string | undefined>();

  const attrs = data?.attrs ?? {};
  const displayName = nameOverride ?? data?.name ?? (loading ? "Loading…" : "Not found");
  const description =
    descOverride !== undefined ? descOverride : (data?.description ?? attrs["description"] ?? null);
  const owner = attrs["owner"] ?? null;
  const effectiveStatus = statusOverride ?? attrs["status"] ?? null;
  const effectiveMaturity = maturityOverride ?? attrs["maturity"] ?? null;
  // Prefer the first-class entities.git_url (set by GitHub-import flows) over
  // legacy attrs.repo (precedence lives in getProjectLinks).
  const { prodUrl, repo } = getProjectLinks(attrs, data?.gitUrl);
  const hasIssues = HEALTH_SIGNAL_CONFIG.some((cfg) => attrs[cfg.key]);
  const editable = !!data && !loading && !data.readonly;

  const saveName = async (next: string) => {
    const res = await patchJson(`/api/projects/${projectId}`, { name: next });
    const json = await res.json() as { ok?: boolean; error?: string };
    if (!json.ok) throw new Error(json.error ?? "Failed to save");
    setNameOverride(next);
  };

  const saveDescription = async (next: string) => {
    const res = await patchJson(`/api/projects/${projectId}`, { description: next });
    const json = await res.json() as { ok?: boolean; error?: string };
    if (!json.ok) throw new Error(json.error ?? "Failed to save");
    setDescOverride(next || null);
  };

  const saveStatus = async (next: string) => {
    const res = await setAttr(`/api/projects/${projectId}`, "status", next);
    if (!res.ok) throw new Error("Failed to save");
    setStatusOverride(next);
  };

  const saveMaturity = async (next: string) => {
    const res = await setAttr(`/api/projects/${projectId}`, "maturity", next);
    if (!res.ok) throw new Error("Failed to save");
    setMaturityOverride(next);
  };

  return (
    <div className="shrink-0 bg-surface-drawer border-b border-border-subtle">
      <div className="flex items-start gap-2 px-4 pb-2 pt-4 sm:gap-3 sm:px-5 sm:pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <NameEditor value={displayName} editable={editable} onSave={saveName} />
            {owner && (
              <span className="ui-micro-badge shrink-0 border-border-subtle text-text-tertiary">{owner}</span>
            )}
          </div>
          <DescriptionEditor value={description} editable={editable} onSave={saveDescription} />
          {data?.createdAt && (
            <p className="mt-1 text-micro text-text-muted">Created {compactRelativeDate(data.createdAt)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ui-icon-action shrink-0"
          aria-label="Close project profile"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2 sm:px-5 sm:pb-3">
          <StatusEditor value={effectiveStatus} editable={editable} onSave={saveStatus} />
          <MaturityEditor value={effectiveMaturity} editable={editable} onSave={saveMaturity} />
          {hasIssues && (
            <span className="ui-tag ui-tag-negative gap-1">
              <AlertTriangle className="h-3 w-3" /> Issues detected
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 border-t border-border-subtle px-4 py-2 sm:px-5">
        <div className="ui-card-actions min-w-0 flex-1">
          {data && (
            <LokiDispatchButton
              prompt={buildProjectLokiPrompt(data)}
              title="Ask Loki about this project"
              className="ui-icon-action"
            />
          )}
          {prodUrl && (
            <a
              href={prodUrl}
              target="_blank"
              rel="noreferrer"
              className="ui-icon-action"
              title="Live site"
              aria-label="Open live site"
            >
              <Globe className="h-4 w-4" />
            </a>
          )}
          {repo && (
            <a
              href={repo}
              target="_blank"
              rel="noreferrer"
              className="ui-icon-action"
              title="Repository"
              aria-label="Open repository"
            >
              <GitBranch className="h-4 w-4" />
            </a>
          )}
          {editable && <OrangeCatPublishButton projectId={projectId} />}
          {data?.runtimeState && (
            <Link
              href={NAV.control.href}
              className="ui-icon-action"
              title={`Agent active — go to Control (${data.runtimeState.tabName})`}
              aria-label="Open in Control"
            >
              <Activity className="h-4 w-4 text-accent-text" />
            </Link>
          )}
          {editable && (
            <DeleteButton
              onDelete={async () => {
                const res = await deleteJson(`/api/projects/${projectId}`);
                if (!res.ok) await throwApiError(res, "Failed to delete");
                onDeleteSuccess();
                router.refresh();
              }}
              label="Delete?"
              triggerTitle="Delete project"
              triggerClassName="ui-icon-action text-status-negative hover:bg-surface-raised"
            />
          )}
        </div>
      </div>

      <ProjectDetailTabBar tab={tab} setTab={setTab} jobCount={jobCount} goalCount={goalCount} />
    </div>
  );
}
