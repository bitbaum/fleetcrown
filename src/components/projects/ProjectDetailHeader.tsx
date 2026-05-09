"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Globe, GitBranch, AlertTriangle } from "lucide-react";
import { DeleteButton } from "@/components/ui/delete-button";
import { setAttr } from "@/lib/api/attrs";
import type { ProjectData, Tab } from "./project-detail-types";
import { ISSUE_ATTRS, getProjectLinks } from "./project-detail-types";
import {
  NameEditor,
  DescriptionEditor,
  StatusEditor,
  MaturityEditor,
} from "./ProjectInlineEditors";
import { ProjectDetailTabBar } from "./ProjectDetailTabBar";
import { patchJson, deleteJson, throwApiError } from "@/lib/api/fetch";

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
  const { prodUrl, repo } = getProjectLinks(attrs);
  const hasIssues = ISSUE_ATTRS.some((k) => attrs[k]);

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
    await setAttr(`/api/projects/${projectId}`, "status", next);
    setStatusOverride(next);
  };

  const saveMaturity = async (next: string) => {
    await setAttr(`/api/projects/${projectId}`, "maturity", next);
    setMaturityOverride(next);
  };

  return (
    <div className="shrink-0 bg-surface-drawer border-b border-border-subtle">
      <div className="flex flex-col gap-3 px-4 pb-3 pt-4 sm:flex-row sm:items-start sm:px-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <NameEditor value={displayName} editable={!!data && !loading} onSave={saveName} />
            {owner && (
              <span className="ui-micro-badge border-border-subtle text-text-tertiary shrink-0">{owner}</span>
            )}
          </div>
          <DescriptionEditor value={description} onSave={saveDescription} />
        </div>

        <div className="ui-card-actions shrink-0 self-start">
          {prodUrl && (
            <a
              href={prodUrl}
              target="_blank"
              rel="noreferrer"
              className="ui-icon-action"
              title="Live site"
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
            >
              <GitBranch className="h-4 w-4" />
            </a>
          )}
          {data && (
            <DeleteButton
              onDelete={async () => {
                const res = await deleteJson(`/api/projects/${projectId}`);
                if (!res.ok) await throwApiError(res, "Failed to delete");
                onDeleteSuccess();
                router.refresh();
              }}
              label="Delete?"
              triggerTitle="Delete project"
              triggerClassName="ui-icon-action ml-1 text-status-negative hover:bg-surface-raised"
            />
          )}
          <button
            onClick={onClose}
            className="ui-icon-action ml-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
          <StatusEditor value={effectiveStatus} onSave={saveStatus} />
          <MaturityEditor value={effectiveMaturity} onSave={saveMaturity} />
          {hasIssues && (
            <span className="flex items-center gap-1 text-micro text-status-negative/70 ml-auto">
              <AlertTriangle className="h-3 w-3" /> Issues detected
            </span>
          )}
        </div>
      )}

      <ProjectDetailTabBar tab={tab} setTab={setTab} jobCount={jobCount} goalCount={goalCount} />
    </div>
  );
}
