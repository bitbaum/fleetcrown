"use client";

import { useState, useEffect } from "react";
import { X, Bot, Send, AlertTriangle, CheckCircle2, Play } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { CronJob } from "@/lib/crons";

function humanSchedule(expr: string, tz: string): string {
  const map: Record<string, string> = {
    "0 6 * * *": "Daily at 6:00",
    "0 20 * * 5": "Every Friday at 20:00",
    "0 20 * * 0-4": "Sun–Thu at 20:00",
    "30 3 * * *": "Daily at 3:30",
    "0 9 * * 1": "Every Monday at 9:00",
    "0 4 * * 0": "Every Sunday at 4:00",
    "0 7,11,15,19 * * *": "4× daily (7, 11, 15, 19)",
    "0 10 * * 4": "Every Thursday at 10:00",
    "0 9 1 * *": "1st of every month at 9:00",
  };
  const human = map[expr] ?? expr;
  return `${human} (${tz})`;
}

export function JobDetail({
  job,
  onClose,
  onToggle,
  onSavePrompt,
}: {
  job: CronJob;
  onClose: () => void;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onSavePrompt: (id: string, message: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(job.payload.message);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<{ ok: boolean; text: string } | null>(null);

  const isDirty = prompt !== job.payload.message;

  const handleRunNow = async () => {
    setRunning(true);
    setRunOutput(null);
    try {
      const res = await fetch("/api/crons/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id }),
      });
      const data = await res.json();
      setRunOutput({ ok: data.ok, text: data.output ?? data.error ?? "Done" });
    } catch (e) {
      setRunOutput({ ok: false, text: String(e) });
    } finally {
      setRunning(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await onSavePrompt(job.id, prompt);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleToggle = async () => {
    setToggling(true);
    await onToggle(job.id, !job.enabled);
    setToggling(false);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const lastRun = job.state?.lastRunAtMs;
  const nextRun = job.state?.nextRunAtMs;
  const hasError = (job.state?.consecutiveErrors ?? 0) > 0;
  const status = job.state?.lastStatus ?? job.state?.lastRunStatus;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface-modal border-l border-white/10 overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 border-b border-white/10 bg-surface-modal">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-emerald-400 shrink-0" />
              <h2 className="text-base font-semibold truncate">{job.name}</h2>
            </div>
            <div className="text-xs text-white/40 mt-0.5">
              {humanSchedule(job.schedule.expr, job.schedule.tz)}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Run Now */}
            <button
              onClick={handleRunNow}
              disabled={running}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80 disabled:opacity-40 transition-colors"
              title="Run now (debug)"
            >
              <Play className="h-3 w-3" />
              {running ? "Running…" : "Run now"}
            </button>
            {/* Enable toggle */}
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                job.enabled
                  ? "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              {job.enabled ? "Enabled" : "Disabled"}
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-5">
          {/* Status row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md bg-white/[0.03] border border-white/5 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Last Run</div>
              {lastRun ? (
                <div className="text-xs text-white/70">
                  {formatDistanceToNow(new Date(lastRun), { addSuffix: true })}
                </div>
              ) : (
                <div className="text-xs text-white/30">Never</div>
              )}
            </div>
            <div className="rounded-md bg-white/[0.03] border border-white/5 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Status</div>
              {!status || status === "never" ? (
                <div className="text-xs text-white/30">Never run</div>
              ) : hasError ? (
                <div className="flex items-center gap-1 text-xs text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  {job.state?.consecutiveErrors} err
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  OK
                </div>
              )}
            </div>
            <div className="rounded-md bg-white/[0.03] border border-white/5 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Next Run</div>
              {nextRun ? (
                <div className="text-xs text-white/70">
                  {formatDistanceToNow(new Date(nextRun), { addSuffix: true })}
                </div>
              ) : (
                <div className="text-xs text-white/30">—</div>
              )}
            </div>
          </div>

          {/* Error detail */}
          {hasError && job.state?.lastError && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3">
              <div className="flex items-center gap-2 text-red-400 text-xs font-medium mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Last Error
              </div>
              <div className="text-xs text-red-300/80">{job.state.lastError}</div>
              {job.state.lastErrorReason && (
                <div className="text-xs text-red-400/50 mt-1">
                  Reason: {job.state.lastErrorReason}
                </div>
              )}
            </div>
          )}

          {/* Config */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-white/[0.03] border border-white/5 p-2.5">
              <span className="text-white/30">Model</span>
              <span className="ml-2 text-white/60 font-mono">{job.payload.model}</span>
            </div>
            <div className="rounded-md bg-white/[0.03] border border-white/5 p-2.5">
              <span className="text-white/30">Thinking</span>
              <span className="ml-2 text-white/60 font-mono">{job.payload.thinking}</span>
            </div>
            <div className="rounded-md bg-white/[0.03] border border-white/5 p-2.5">
              <span className="text-white/30">Timeout</span>
              <span className="ml-2 text-white/60">{job.payload.timeoutSeconds}s</span>
            </div>
            <div className="rounded-md bg-white/[0.03] border border-white/5 p-2.5">
              <span className="text-white/30">Delivery</span>
              <span className="ml-2 text-white/60 capitalize">{job.delivery.channel}</span>
            </div>
          </div>

          {/* Run output */}
          {runOutput && (
            <div className={`rounded-md border p-3 ${runOutput.ok ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
              <div className={`flex items-center gap-2 text-xs font-medium mb-1.5 ${runOutput.ok ? "text-emerald-400" : "text-red-400"}`}>
                {runOutput.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {runOutput.ok ? "Job triggered" : "Run failed"}
              </div>
              <pre className={`text-xs whitespace-pre-wrap font-mono ${runOutput.ok ? "text-emerald-300/70" : "text-red-300/70"}`}>
                {runOutput.text}
              </pre>
            </div>
          )}

          {/* Prompt editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Prompt</span>
              {isDirty && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                >
                  <Send className="h-3 w-3" />
                  {saving ? "Saving..." : saved ? "Saved!" : "Save"}
                </button>
              )}
              {saved && !isDirty && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Saved
                </span>
              )}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={14}
              className="w-full rounded-md bg-white/[0.03] border border-white/10 p-3 text-xs font-mono text-white/70 focus:outline-none focus:border-white/20 resize-y leading-relaxed"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
