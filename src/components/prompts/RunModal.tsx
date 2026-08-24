"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, FolderOpen, Loader2, SquareTerminal, X, Zap } from "lucide-react";
import type { PromptTemplate } from "@/config/prompt-library";
import type { Project } from "./types";
import { Modal } from "@/components/ui/modal";
import { postJson } from "@/lib/api/fetch";
import { useClipboard } from "@/hooks/use-clipboard";
import { useFetch } from "@/hooks/use-fetch";
import { fleetSurfaceHref } from "@/lib/fleet-context";
import { EXECUTOR_COPY } from "@/config/executor-copy";

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
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useClipboard();

  // Live agent sessions, so a template can be sent to the thing that will run
  // it. Until now the library's only verb was "Run with Loki" — a chat
  // completion that answers in a modal and touches no repo — so every prompt
  // meant for an agent had to be copied out of this page by hand.
  const { data: tabsData } = useFetch<{ tabs: string[] }>("/api/control/open-tabs");
  const openTabs = tabsData?.tabs ?? [];
  const [dispatching, setDispatching] = useState(false);
  const [dispatchedTo, setDispatchedTo] = useState<string | null>(null);

  const resolvedMessage =
    template.scope === "project" && projectName
      ? template.template.replaceAll("{{project_name}}", projectName)
      : template.template;

  const canRun = template.scope === "global" || !!projectId;

  // Prefer the tab matching the chosen project; otherwise the only open one.
  // Never guess between several unrelated sessions — dispatching into the wrong
  // agent is not a recoverable mistake.
  const targetTab =
    openTabs.find((tab) => tab.toLowerCase() === projectName.toLowerCase())
    ?? (openTabs.length === 1 ? openTabs[0] : null);

  const handleSendToTerminal = async () => {
    if (!targetTab || dispatching) return;
    setDispatching(true);
    setError(null);
    try {
      await postJson("/api/control/tab-inject", { tab: targetTab, prompt: resolvedMessage });
      setDispatchedTo(targetTab);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDispatching(false);
    }
  };

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
                  <Link
                    href={`/projects/${projectId}`}
                    className="flex items-center gap-1 text-sm font-medium text-accent-text transition-colors hover:text-accent-hover"
                  >
                    <FolderOpen className="h-4 w-4" /> View Project
                  </Link>
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

        <div className="shrink-0 space-y-2 border-t border-border-subtle p-6">
          <div className="flex flex-wrap items-center gap-2">
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
            <button
              onClick={handleSendToTerminal}
              disabled={!canRun || !targetTab || dispatching}
              title={
                !targetTab
                  ? openTabs.length === 0
                    ? "No agent session is open. Dispatch one from Control first."
                    : "Pick the project whose session this should run in."
                  : `Dispatch into the “${targetTab}” session`
              }
              className="ui-btn-secondary disabled:pointer-events-none disabled:opacity-40"
            >
              {dispatching
                ? <><Loader2 className="ui-spinner" /> Sending…</>
                : <><SquareTerminal className="h-4 w-4" /> Send to terminal</>}
            </button>
          </div>
          {/* "Run with Loki" answers in this modal; "Send to terminal" hands the
              prompt to an agent that can actually change the repo. Saying so
              here is cheaper than a user discovering it by picking wrong. */}
          <p className="text-xs text-text-muted">
            Loki answers here. Send to terminal dispatches into a live agent session — assembled with project
            context, and queued if the builder is offline.
          </p>
          {dispatchedTo && (
            <p className="text-xs text-status-positive">
              Queued on {dispatchedTo}.{" "}
              <Link href={fleetSurfaceHref("control", dispatchedTo)} className="underline">
                Watch on Control →
              </Link>{" "}
              <span className="text-text-muted">{EXECUTOR_COPY.honesty.notificationWhenDone}</span>
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
