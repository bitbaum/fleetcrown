"use client";

import { useState } from "react";
import { Zap, Clock, Globe, FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { usePromptModals } from "./use-prompt-modals";
import type { PromptTemplate } from "@/config/prompt-library";
import type { Project } from "./types";

/** Compact row used inside category sections. */
export function PromptRow({
  template,
  projects,
}: {
  template: PromptTemplate;
  projects: Project[];
}) {
  const { openRun, openSchedule, modals } = usePromptModals(template, projects);
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="ui-panel-raised ui-panel-interactive group flex flex-col gap-0">
        <div className="flex items-start gap-4 px-5 py-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="truncate text-lg font-semibold text-text-primary">{template.name}</span>
              {template.scope === "global" ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-border-subtle bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-tertiary">
                  <Globe className="h-3 w-3" /> global
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-border-subtle bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-tertiary">
                  <FolderOpen className="h-3 w-3" /> project
                </span>
              )}
              {template.suggestedSchedule && (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-border-subtle bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-tertiary">
                  <Clock className="h-3 w-3" /> schedulable
                </span>
              )}
            </div>
            <div className="mt-1.5 text-base leading-relaxed text-text-secondary">
              {template.description}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-2xl border border-border-subtle bg-surface-overlay p-3 text-text-tertiary transition-colors hover:border-border-default hover:text-text-primary"
              title="Preview prompt"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {template.suggestedSchedule && (
              <button
                onClick={openSchedule}
                className="rounded-2xl border border-border-subtle bg-surface-overlay p-3 text-text-tertiary transition-colors hover:border-border-default hover:text-text-primary"
                title="Schedule as cron job"
              >
                <Clock className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={openRun}
              className="ui-button-primary flex items-center gap-2 px-4 py-3 text-sm font-semibold"
            >
              <Zap className="h-4 w-4" /> Run
            </button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border-subtle px-5 pb-4 pt-4">
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border-subtle bg-surface-overlay p-4 font-mono text-sm leading-relaxed text-text-secondary">
              {template.template}
            </pre>
          </div>
        )}
      </div>

      {modals}
    </>
  );
}
