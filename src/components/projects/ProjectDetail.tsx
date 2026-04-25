"use client";

import { useCallback, useEffect, useState } from "react";
import { ProjectDetailHeader } from "./ProjectDetailHeader";
import { OverviewTab } from "./ProjectOverviewTab";
import { PromptsTab } from "./ProjectPromptsTab";
import { GoalsTab } from "./ProjectGoalsTab";
import type { ProjectData, Tab, LinkedJob } from "./project-detail-types";

export function ProjectDetail({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [jobs, setJobs] = useState<LinkedJob[]>([]);
  const [tab, setTab] = useState<Tab>("overview");

  const loading = data?.id !== projectId;

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((d: ProjectData) => {
        if (cancelled) return;
        setData(d);
        setJobs(d.linkedJobs ?? []);
      })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [projectId, reloadKey]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-[#0c0e14] border-l border-white/10 flex flex-col shadow-2xl">
        <ProjectDetailHeader
          data={data}
          loading={loading}
          projectId={projectId}
          tab={tab}
          setTab={setTab}
          onClose={onClose}
          onDeleteSuccess={onClose}
          jobCount={jobs.length}
          goalCount={data?.linkedGoals.length ?? 0}
        />

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/30" />
            </div>
          ) : !data ? (
            <p className="text-sm text-white/30">Project not found</p>
          ) : tab === "overview" ? (
            <OverviewTab data={data} projectId={projectId} onReload={reload} />
          ) : tab === "prompts" ? (
            <PromptsTab data={data} projectId={projectId} jobs={jobs} setJobs={setJobs} />
          ) : (
            <GoalsTab goals={data.linkedGoals} projectId={data.id} />
          )}
        </div>
      </div>
    </div>
  );
}
