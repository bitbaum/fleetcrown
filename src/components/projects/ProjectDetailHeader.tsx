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
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    if ((await res.json()).ok) setNameOverride(next);
  };

  const saveDescription = async (next: string) => {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: next }),
    });
    if ((await res.json()).ok) setDescOverride(next || null);
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
    <div className="shrink-0 bg-surface-drawer border-b border-white/10">
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <NameEditor value={displayName} editable={!!data && !loading} onSave={saveName} />
            {owner && (
              <span className="text-[10px] text-white/25 border border-white/10 rounded px-1.5 py-0.5 shrink-0">{owner}</span>
            )}
          </div>
          <DescriptionEditor value={description} onSave={saveDescription} />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {prodUrl && (
            <a
              href={prodUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded hover:bg-white/10 text-white/35 hover:text-white/70 transition-colors"
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
              className="p-1.5 rounded hover:bg-white/10 text-white/35 hover:text-white/70 transition-colors"
              title="Repository"
            >
              <GitBranch className="h-4 w-4" />
            </a>
          )}
          {data && (
            <DeleteButton
              onDelete={async () => {
                await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
                onDeleteSuccess();
                router.refresh();
              }}
              label="Delete?"
              triggerTitle="Delete project"
              triggerClassName="ml-1 p-1.5 rounded text-white/20 hover:text-red-400 hover:bg-white/5 transition-colors"
            />
          )}
          <button
            onClick={onClose}
            className="ml-1 p-1.5 rounded hover:bg-white/10 text-white/35 hover:text-white/70 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <StatusEditor value={effectiveStatus} onSave={saveStatus} />
          <MaturityEditor value={effectiveMaturity} onSave={saveMaturity} />
          {hasIssues && (
            <span className="flex items-center gap-1 text-[10px] text-red-400/70 ml-auto">
              <AlertTriangle className="h-3 w-3" /> Issues detected
            </span>
          )}
        </div>
      )}

      <ProjectDetailTabBar tab={tab} setTab={setTab} jobCount={jobCount} goalCount={goalCount} />
    </div>
  );
}
