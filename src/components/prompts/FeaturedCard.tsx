"use client";

import { Zap, Clock } from "lucide-react";
import { usePromptModals } from "./use-prompt-modals";
import { CATEGORY_META, type PromptTemplate } from "@/config/prompt-library";
import type { Project } from "./types";

/** Larger card used in the Quick Access grid above category sections. */
export function FeaturedCard({
  template,
  projects,
}: {
  template: PromptTemplate;
  projects: Project[];
}) {
  const { openRun, openSchedule, modals } = usePromptModals(template, projects);
  const meta = CATEGORY_META[template.category];

  return (
    <>
      <div className="ui-panel-raised ui-panel-interactive flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className={`ui-chip ${meta.color}`}>{meta.label}</span>
            <div className="mt-3 text-xl font-semibold leading-snug text-text-primary">{template.name}</div>
            <div className="mt-1.5 text-base leading-relaxed text-text-secondary">
              {template.description}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-auto">
          <button
            onClick={openRun}
            className="ui-btn-lg flex flex-1 items-center justify-center gap-2"
          >
            <Zap className="h-4 w-4" /> Run Now
          </button>
          {template.suggestedSchedule && (
            <button
              onClick={openSchedule}
              className="ui-btn-overlay flex items-center justify-center gap-1.5 px-4 py-3"
              title="Schedule"
            >
              <Clock className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {modals}
    </>
  );
}
