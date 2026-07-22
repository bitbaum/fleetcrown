"use client";

import { useState } from "react";
import { RunModal } from "./RunModal";
import { ScheduleModal } from "./ScheduleModal";
import type { PromptTemplate } from "@/config/prompt-library";
import type { Project } from "./types";

/**
 * Wires up the Run + Schedule modals for a prompt template card. PromptCard
 * (defaults) and UserPromptsSection (saved prompts) need the same pair of
 * toggles plus the matching <RunModal> / <ScheduleModal> renders, so collapse
 * them here.
 *
 * Usage:
 *   const { openRun, openSchedule, modals } = usePromptModals(template, projects);
 *   <button onClick={openRun}>Run</button>
 *   {modals}
 */
export function usePromptModals(template: PromptTemplate, projects: Project[]) {
  const [showRun, setShowRun] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const modals = (
    <>
      {showRun && (
        <RunModal template={template} projects={projects} onClose={() => setShowRun(false)} />
      )}
      {showSchedule && (
        <ScheduleModal template={template} projects={projects} onClose={() => setShowSchedule(false)} />
      )}
    </>
  );

  return {
    openRun: () => setShowRun(true),
    openSchedule: () => setShowSchedule(true),
    modals,
  };
}
