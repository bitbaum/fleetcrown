"use client";

import { useState } from "react";
import { Zap, Clock, Globe, FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { ScheduleModal } from "./ScheduleModal";
import { RunModal } from "./RunModal";
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
  const [showRun, setShowRun] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="group flex flex-col gap-0 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.04] transition-colors">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-white/80 truncate">{template.name}</span>
              {template.scope === "global" ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/25 border border-white/[0.07] flex items-center gap-0.5 shrink-0">
                  <Globe className="h-2 w-2" /> global
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/25 border border-white/[0.07] flex items-center gap-0.5 shrink-0">
                  <FolderOpen className="h-2 w-2" /> project
                </span>
              )}
              {template.suggestedSchedule && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/20 border border-white/[0.06] flex items-center gap-0.5 shrink-0">
                  <Clock className="h-2 w-2" /> schedulable
                </span>
              )}
            </div>
            <div className="text-xs text-white/35 mt-0.5 leading-relaxed truncate">{template.description}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded text-white/20 hover:text-white/50 transition-colors"
              title="Preview prompt"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {template.suggestedSchedule && (
              <button
                onClick={() => setShowSchedule(true)}
                className="p-1.5 rounded text-white/20 hover:text-white/50 transition-colors"
                title="Schedule as cron job"
              >
                <Clock className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setShowRun(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
            >
              <Zap className="h-3 w-3" /> Run
            </button>
          </div>
        </div>

        {expanded && (
          <div className="px-4 pb-3 border-t border-white/[0.05] pt-3">
            <pre className="text-[11px] text-white/40 whitespace-pre-wrap leading-relaxed font-mono bg-black/20 rounded-lg p-2.5 border border-white/[0.05] max-h-36 overflow-y-auto">
              {template.template}
            </pre>
          </div>
        )}
      </div>

      {showRun && (
        <RunModal template={template} projects={projects} onClose={() => setShowRun(false)} />
      )}
      {showSchedule && (
        <ScheduleModal template={template} projects={projects} onClose={() => setShowSchedule(false)} />
      )}
    </>
  );
}
