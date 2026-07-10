"use client";

import { useState } from "react";
import { Check, Copy, FolderOpen, Loader2, X, Zap } from "lucide-react";
import { ProjectDetail } from "@/components/projects/ProjectDetail";
import type { PromptTemplate } from "@/config/prompt-library";
import type { Project } from "./types";
import { Modal } from "@/components/ui/modal";
import { postJson } from "@/lib/api/fetch";
import { useClipboard } from "@/hooks/use-clipboard";

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
  const { copied, copy } = useClipboard();

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
      const res = await postJson("/api/loki", { message: resolvedMessage });
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
    if (result) copy(result);
  };

  return (
    <>
      <Modal onClose={onClose} size="2xl" padded={false} disableClose={running} className="flex flex-col">
        <div className="shrink-0 border-b border-border-subtle p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-semibold text-text-primary">{template.name}</div>
              <div className="mt-1 text-base text-text-secondary">{template.description}</div>
            </div>
            <button
              onClick={onClose}
              disabled={running}
              className="ui-btn-overlay p-2 disabled:opacity-30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <div className="ui-kicker mb-2">Resolved Prompt</div>
            <pre className="ui-code-surface">
              {resolvedMessage}
            </pre>
          </div>

          {template.scope === "project" && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="ui-kicker text-text-tertiary">Project</label>
                {projectId && projectId !== "__global__" && (
                  <button
                    onClick={() => setShowProjectDetail(true)}
                    className="flex items-center gap-1 text-sm font-medium text-accent-text transition-colors hover:text-accent-hover"
                  >
                    <FolderOpen className="h-4 w-4" /> View Project
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
                className="ui-input"
              >
                <option value="">— Select project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {(running || result || error) && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span>Loki&apos;s Response</span>
                {result && (
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-sm font-medium text-text-tertiary transition-colors hover:text-text-primary"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
              {running && (
                <div className="ui-card-shell flex items-center gap-2 p-4 text-base text-text-secondary">
                  <Loader2 className="ui-spinner text-accent-primary" />
                  Loki is working… (this may take up to 60s)
                </div>
              )}
              {error && (
                <div className="ui-box-error">
                  {error}
                </div>
              )}
              {result && (
                <pre className="ui-code-surface">
                  {result}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border-subtle p-6">
          <button
            onClick={handleRun}
            disabled={!canRun || running}
            className="ui-btn-submit"
          >
            {running ? (
              <><Loader2 className="ui-spinner" /> Running…</>
            ) : (
              <><Zap className="h-4 w-4" /> Run with Loki</>
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
