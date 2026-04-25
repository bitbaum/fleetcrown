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
      <div className="flex flex-col gap-3 p-4 rounded-xl bg-white/[0.04] border border-white/[0.09] hover:border-white/[0.15] hover:bg-white/[0.06] transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${meta.color}`}>
              {meta.label}
            </span>
            <div className="text-sm font-semibold mt-1.5 leading-snug">{template.name}</div>
            <div className="text-xs text-white/40 mt-0.5 leading-relaxed line-clamp-2">{template.description}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-auto">
          <button
            onClick={openRun}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
          >
            <Zap className="h-3.5 w-3.5" /> Run now
          </button>
          {template.suggestedSchedule && (
            <button
              onClick={openSchedule}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-white/50 text-xs transition-colors border border-white/10"
              title="Schedule"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {modals}
    </>
  );
}
