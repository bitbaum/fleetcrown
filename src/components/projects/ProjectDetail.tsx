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
  const [refetching, setRefetching] = useState(false);
  const [jobs, setJobs] = useState<LinkedJob[]>([]);
  const [tab, setTab] = useState<Tab>("overview");

  const loading = data?.id !== projectId;

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    // Defer setRefetching off the synchronous effect path to avoid
    // react-hooks/set-state-in-effect cascading-render warning.
    Promise.resolve().then(() => { if (!cancelled) setRefetching(true); });
    getJson<ProjectData>(`/api/projects/${projectId}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setJobs(d.linkedJobs ?? []);
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setRefetching(false); });
    return () => { cancelled = true; };
  }, [projectId, reloadKey]);

  return (
    <Drawer onClose={onClose} size="xl" surface="drawer">
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

      {/* Subtle refresh indicator — visible while refetching with stale data on screen. */}
      {refetching && data && (
        <div className="absolute top-3 right-3 z-10 pointer-events-none">
          <Loader2 className="ui-spinner-sm text-text-tertiary" />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-subtle border-t-white/30" />
          </div>
        ) : !data ? (
          <p className="text-sm text-text-secondary">Project not found</p>
        ) : tab === "overview" ? (
          <OverviewTab data={data} projectId={projectId} onReload={reload} />
        ) : tab === "prompts" ? (
          <PromptsTab data={data} projectId={projectId} jobs={jobs} setJobs={setJobs} />
        ) : (
          <GoalsTab goals={data.linkedGoals} projectId={data.id} />
        )}
      </div>
    </Drawer>
  );
}
