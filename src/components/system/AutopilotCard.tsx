"use client";

import { useState } from "react";
import { Bot, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import type { CronJob } from "@/app/api/crons/route";
import { JobDetail } from "./JobDetail";

function StatusDot({ status, errors }: { status?: string; errors?: number }) {
  if (!status || status === "never")
    return <span className="h-2 w-2 rounded-full bg-white/20 shrink-0" title="Never run" />;
  if (status === "ok" || status === "completed")
    return <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" title="OK" />;
  if (errors && errors > 0)
    return <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" title={`${errors} errors`} />;
  return <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title="Unknown" />;
}

function humanSchedule(expr: string): string {
  const map: Record<string, string> = {
    "0 6 * * *": "Daily 6:00",
    "0 20 * * 5": "Fri 20:00",
    "0 20 * * 0-4": "Sun–Thu 20:00",
    "30 3 * * *": "Daily 3:30",
    "0 9 * * 1": "Mon 9:00",
    "0 4 * * 0": "Sun 4:00",
    "0 7,11,15,19 * * *": "4× daily",
    "0 10 * * 4": "Thu 10:00",
    "0 9 1 * *": "Monthly 1st",
  };
  return map[expr] ?? expr;
}

export function AutopilotCard({ initialJobs }: { initialJobs: CronJob[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [selected, setSelected] = useState<CronJob | null>(null);

  const handleToggle = async (id: string, enabled: boolean) => {
    const res = await fetch("/api/crons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    if (res.ok) {
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, enabled } : j)));
      if (selected?.id === id) setSelected((prev) => prev && { ...prev, enabled });
    }
  };

  const handleSavePrompt = async (id: string, message: string) => {
    const res = await fetch("/api/crons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, message }),
    });
    if (res.ok) {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id ? { ...j, payload: { ...j.payload, message } } : j,
        ),
      );
      if (selected?.id === id)
        setSelected((prev) => prev && { ...prev, payload: { ...prev.payload, message } });
    }
  };

  const okCount = jobs.filter(
    (j) => j.state?.lastStatus === "ok" || j.state?.lastRunStatus === "ok",
  ).length;
  const errCount = jobs.filter((j) => (j.state?.consecutiveErrors ?? 0) > 0).length;

  return (
    <>
      <Card>
        <CardHeader
          icon={Bot}
          title="Autopilot"
          right={
            <div className="flex items-center gap-2 text-xs">
              {okCount > 0 && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {okCount}
                </span>
              )}
              {errCount > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <XCircle className="h-3.5 w-3.5" />
                  {errCount} err
                </span>
              )}
            </div>
          }
        />
        <div className="space-y-1">
          {jobs.map((job) => {
            const lastRun = job.state?.lastRunAtMs;
            const nextRun = job.state?.nextRunAtMs;
            const status = job.state?.lastStatus ?? job.state?.lastRunStatus;
            const errors = job.state?.consecutiveErrors ?? 0;
            const hasError = errors > 0;

            return (
              <div
                key={job.id}
                onClick={() => setSelected(job)}
                className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.04] transition-colors group cursor-pointer"
              >
                <StatusDot status={status} errors={errors} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium truncate ${!job.enabled ? "text-white/30" : ""}`}
                    >
                      {job.name}
                    </span>
                    {!job.enabled && (
                      <span className="text-[10px] uppercase tracking-wider text-white/20 shrink-0">
                        off
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-white/30">
                      {humanSchedule(job.schedule.expr)}
                    </span>
                    {hasError && job.state?.lastError && (
                      <span className="flex items-center gap-1 text-[10px] text-red-400/70 truncate">
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                        {job.state.lastError}
                      </span>
                    )}
                    {!hasError && nextRun && (
                      <span className="flex items-center gap-1 text-[10px] text-white/20 shrink-0">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(nextRun), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(job.id, !job.enabled);
                  }}
                  className={`relative shrink-0 h-4 w-7 rounded-full transition-colors ${
                    job.enabled ? "bg-emerald-600" : "bg-white/10"
                  }`}
                  title={job.enabled ? "Disable" : "Enable"}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                      job.enabled ? "translate-x-3.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {selected && (
        <JobDetail
          job={selected}
          onClose={() => setSelected(null)}
          onToggle={handleToggle}
          onSavePrompt={handleSavePrompt}
        />
      )}
    </>
  );
}
