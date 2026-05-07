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
      <div className="ui-card-shell-raised ui-panel-interactive group flex flex-col gap-0">
        <div className="ui-card-padding">
          <div className="ui-card-header !mb-0">
            <div className="ui-card-header-main">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="truncate text-lg font-semibold text-text-primary" title={template.name}>{template.name}</span>
              {template.scope === "global" ? (
                <span className="ui-badge"><Globe className="h-3 w-3" /> global</span>
              ) : (
                <span className="ui-badge"><FolderOpen className="h-3 w-3" /> project</span>
              )}
              {template.suggestedSchedule && (
                <span className="ui-badge"><Clock className="h-3 w-3" /> schedulable</span>
              )}
            </div>
            <div className="mt-1.5 text-base leading-relaxed text-text-secondary">
              {template.description}
            </div>
            </div>
            <div className="ui-card-actions shrink-0 self-start">
              <button
                onClick={() => setExpanded(!expanded)}
                className="ui-btn-overlay p-3"
                title="Preview prompt"
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {template.suggestedSchedule && (
                <button
                  onClick={openSchedule}
                  className="ui-btn-overlay p-3"
                  title="Schedule as cron job"
                >
                  <Clock className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={openRun}
                className="ui-btn-lg flex items-center gap-2"
              >
                <Zap className="h-4 w-4" /> Run
              </button>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="ui-card-section">
            <pre className="ui-code-surface">
              {template.template}
            </pre>
          </div>
        )}
      </div>

      {modals}
    </>
  );
}
