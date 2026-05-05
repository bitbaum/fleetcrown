"use client";

import { useState } from "react";
import { AlertTriangle, Bot, ChevronDown, ChevronUp, Loader2, Plus, ToggleLeft, ToggleRight, X, Zap } from "lucide-react";
import { createCronJob, patchCronJob } from "@/lib/api/crons";
import type { LinkedJob, ProjectData } from "./project-detail-types";

// ─── JobRow ───────────────────────────────────────────────────────────────────

function JobRow({ job, onToggle }: { job: LinkedJob; onToggle: (id: string, enabled: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = (job.consecutiveErrors ?? 0) > 0;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-base overflow-hidden">
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-surface-base transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${hasError ? "bg-status-negative" : job.enabled ? "bg-status-positive" : "bg-status-neutral"}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text-primary truncate" title={job.name}>{job.name}</div>
          <div className="text-[10px] text-text-tertiary font-mono mt-0.5">{job.schedule}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(job.id, !job.enabled); }}
            className="text-text-muted hover:text-text-secondary transition-colors"
          >
            {job.enabled
              ? <ToggleRight className="h-4 w-4 text-status-positive" />
              : <ToggleLeft className="h-4 w-4" />}
          </button>
          {expanded ? <ChevronUp className="h-3 w-3 text-text-muted" /> : <ChevronDown className="h-3 w-3 text-text-muted" />}
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border-subtle">
          <div className="ui-micro-label mt-2.5 mb-1.5">Prompt</div>
          <pre className="text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed font-mono bg-black/20 rounded p-2.5 max-h-48 overflow-y-auto">
            {job.message}
          </pre>
          {hasError && (
            <div className="mt-2 text-[10px] text-status-negative/70 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {job.consecutiveErrors} consecutive error{(job.consecutiveErrors ?? 0) > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NewJobForm ───────────────────────────────────────────────────────────────

function NewJobForm({
  projectId,
  projectName,
  onCreated,
}: {
  projectId: string;
  projectName: string;
  onCreated: (job: LinkedJob) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${projectName} — `);
  const [schedule, setSchedule] = useState("0 9 * * 1");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim() || !schedule.trim() || !message.trim() || saving) return;
    setSaving(true);
    const res = await createCronJob({ name, scheduleExpr: schedule, message, projectId, projectName });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      onCreated({
        id: data.job.id, name: data.job.name,
        message: data.job.payload.message, enabled: data.job.enabled,
        schedule: data.job.schedule.expr, consecutiveErrors: 0,
      });
      setOpen(false);
      setMessage("");
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-status-positive transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> New autopilot job for this project
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-status-positive/20 bg-status-positive-subtle p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-status-positive/70 uppercase tracking-wider">New Autopilot Job</div>
        <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-secondary"><X className="h-3.5 w-3.5" /></button>
      </div>
      <input placeholder="Job name" value={name} onChange={(e) => setName(e.target.value)}
        className="w-full ui-input-compact" />
      <input placeholder="Cron (e.g. 0 9 * * 1 = Mon 9am)" value={schedule} onChange={(e) => setSchedule(e.target.value)}
        className="w-full font-mono ui-input-compact" />
      <textarea placeholder="Prompt / instructions for Ivy…" value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
        className="w-full bg-surface-raised border border-border-subtle rounded px-2.5 py-2 text-xs text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-border-strong" />
      <button onClick={create} disabled={!name.trim() || !schedule.trim() || !message.trim() || saving}
        className="w-full py-1.5 rounded ui-btn-confirm disabled:opacity-30 text-xs font-medium transition-colors flex items-center justify-center gap-1.5">
        {saving ? <Loader2 className="ui-spinner-sm" /> : <Plus className="h-3.5 w-3.5" />}
        Create Job
      </button>
    </div>
  );
}

// ─── PromptsTab ───────────────────────────────────────────────────────────────

export function PromptsTab({
  data,
  projectId,
  jobs,
  setJobs,
}: {
  data: ProjectData;
  projectId: string;
  jobs: LinkedJob[];
  setJobs: React.Dispatch<React.SetStateAction<LinkedJob[]>>;
}) {
  const toggleJob = async (id: string, enabled: boolean) => {
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, enabled } : j));
    await patchCronJob({ id, enabled });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 ui-micro-label font-medium">
        <Bot className="h-3.5 w-3.5" />
        Autopilot Jobs {jobs.length > 0 && <span className="text-text-tertiary normal-case">({jobs.length})</span>}
      </div>

      {jobs.length === 0 ? (
        <p className="text-xs text-text-secondary">No autopilot jobs linked to this project yet.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onToggle={toggleJob} />
          ))}
        </div>
      )}

      <NewJobForm
        projectId={projectId}
        projectName={data.name}
        onCreated={(job) => setJobs((prev) => [...prev, job])}
      />

      <a
        href="/prompts"
        className="ui-btn-add"
      >
        <Zap className="h-3.5 w-3.5" /> Browse Prompt Library →
      </a>
    </div>
  );
}
