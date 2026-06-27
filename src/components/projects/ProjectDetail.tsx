"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ProjectDetailHeader } from "./ProjectDetailHeader";
import { OverviewTab } from "./ProjectOverviewTab";
import { PromptsTab } from "./ProjectPromptsTab";
import { GoalsTab } from "./ProjectGoalsTab";
import type { ProjectData, Tab, LinkedJob } from "./project-detail-types";
import { Drawer } from "@/components/ui/modal";
import { getJson } from "@/lib/api/fetch";

export function ProjectDetail({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [jobs, setJobs] = useState<LinkedJob[]>([]);
  const [tab, setTab] = useState<Tab>("overview");

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    // Defer setRefetching to avoid cascading-render warning when data is already present.
    if (!data) setInitialLoading(true);
    else Promise.resolve().then(() => { if (!cancelled) setRefetching(true); });
    getJson<ProjectData>(`/api/projects/${projectId}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setJobs(d.linkedJobs ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setLoadFailed(true);
      })
      .finally(() => {
        if (cancelled) return;
        setInitialLoading(false);
        setRefetching(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, reloadKey]);

  return (
    <Drawer onClose={onClose} size="2xl" surface="drawer">
      <ProjectDetailHeader
        data={data}
        loading={initialLoading}
        projectId={projectId}
        tab={tab}
        setTab={setTab}
        onClose={onClose}
        onDeleteSuccess={onClose}
        jobCount={jobs.length}
        goalCount={data?.linkedGoals.length ?? 0}
      />

      {/* Subtle refresh indicator — visible while refetching with stale data on screen. */}
      {refetching && data && (
        <div className="absolute top-3 right-3 z-10 pointer-events-none">
          <Loader2 className="ui-spinner-sm text-text-tertiary" />
        </div>
      )}

      <div className="ui-drawer-body p-4 sm:p-5 md:p-6">
        {initialLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="ui-loading-ring" />
          </div>
        ) : loadFailed || !data ? (
          <p className="text-sm text-status-negative">Failed to load project — check your connection and try again.</p>
        ) : tab === "overview" ? (
          <OverviewTab data={data} projectId={projectId} onReload={reload} />
        ) : tab === "prompts" ? (
          <PromptsTab data={data} projectId={projectId} jobs={jobs} setJobs={setJobs} />
        ) : (
          <GoalsTab goals={data.linkedGoals} projectId={data.id} onReload={reload} />
        )}
      </div>
    </Drawer>
  );
}
