"use client";

import { useState } from "react";
import { Check, Copy, FolderOpen, Loader2, X, Zap } from "lucide-react";
import { ProjectDetail } from "@/components/projects/ProjectDetail";
import type { PromptTemplate } from "@/config/prompt-library";
import type { Project } from "./types";
import { Modal } from "@/components/ui/modal";
import { FIELD_INPUT_CLASS, PRIMARY_BUTTON_CLASS } from "@/components/ui/form";
import { postJson } from "@/lib/api/fetch";

export function RunModal({
  template,
  projects,
  onClose,
}: {
  template: PromptTemplate;
  projects: Project[];
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(
    template.scope === "global" ? "__global__" : "",
  );
  const [projectName, setProjectName] = useState("");
  const [showProjectDetail, setShowProjectDetail] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resolvedMessage =
    template.scope === "project" && projectName
      ? template.template.replaceAll("{{project_name}}", projectName)
      : template.template;

  const canRun = template.scope === "global" || !!projectId;

  const handleRun = async () => {
    if (!canRun || running) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await postJson("/api/ivy", { message: resolvedMessage });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data.text ?? "");
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <>
      <Modal onClose={onClose} size="2xl" padded={false} disableClose={running} className="flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-white/10 shrink-0">
          <div>
            <div className="text-sm font-semibold">{template.name}</div>
            <div className="text-xs text-white/40 mt-0.5">{template.description}</div>
          </div>
          <button onClick={onClose} disabled={running} className="p-1 text-white/40 hover:text-white/70 rounded disabled:opacity-30">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {/* Project selector */}
          {template.scope === "project" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] uppercase tracking-wider text-white/30">Project</label>
                {projectId && projectId !== "__global__" && (
                  <button
                    onClick={() => setShowProjectDetail(true)}
                    className="text-[10px] text-emerald-400/70 hover:text-emerald-400 transition-colors flex items-center gap-1"
                  >
                    <FolderOpen className="h-3 w-3" /> View project →
                  </button>
                )}
              </div>
              <select
                value={projectId}
                onChange={(e) => {
                  const p = projects.find((p) => p.id === e.target.value);
                  setProjectId(e.target.value);
                  setProjectName(p?.name ?? "");
                }}
                className={FIELD_INPUT_CLASS}
              >
                <option value="">— Select project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Prompt preview */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">Prompt</div>
            <pre className="text-[11px] text-white/50 whitespace-pre-wrap leading-relaxed font-mono bg-black/20 rounded-lg p-3 border border-white/[0.06] max-h-40 overflow-y-auto">
              {resolvedMessage}
            </pre>
          </div>

          {/* Result */}
          {(running || result || error) && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 flex items-center justify-between">
                <span>Ivy&apos;s Response</span>
                {result && (
                  <button onClick={handleCopy} className="flex items-center gap-1 text-white/30 hover:text-white/60 transition-colors">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
              {running && (
                <div className="flex items-center gap-2 text-xs text-white/40 p-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  Ivy is working… (this may take up to 60s)
                </div>
              )}
              {error && (
                <div className="text-xs text-red-300/80 p-3 bg-red-500/[0.06] rounded-lg border border-red-500/20">
                  {error}
                </div>
              )}
              {result && (
                <pre className="text-xs text-white/70 whitespace-pre-wrap leading-relaxed p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                  {result}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 shrink-0">
          <button
            onClick={handleRun}
            disabled={!canRun || running}
            className={PRIMARY_BUTTON_CLASS}
          >
            {running ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
            ) : (
              <><Zap className="h-4 w-4" /> Run with Ivy</>
            )}
          </button>
        </div>
      </Modal>

      {/* Project detail overlay */}
      {showProjectDetail && projectId && projectId !== "__global__" && (
        <ProjectDetail
          projectId={projectId}
          onClose={() => setShowProjectDetail(false)}
        />
      )}
    </>
  );
}
