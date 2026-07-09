/**
 * Quick-action chips above the Loki composer — fill the input for edit/send.
 * Wording mirrors control-intents where possible; project name is appended when
 * one project is selected in the right pane.
 */
export type LokiSuggestedAction = {
  id: string;
  label: string;
  /** NL sent to the resolver; `{project}` replaced when scoped. */
  template: string;
};

export const LOKI_SUGGESTED_ACTIONS: LokiSuggestedAction[] = [
  { id: "move_forward", label: "Move forward", template: "move forward on {project}" },
  { id: "develop_all", label: "Build fleet", template: "develop all my projects" },
  { id: "next_best", label: "Next best", template: "next best for {project}" },
  { id: "quality", label: "Code review", template: "code review for {project}" },
  { id: "test_and_fix", label: "Fix tests", template: "fix types and tests for {project}" },
  { id: "ux_review", label: "Review UI", template: "review the ui for {project}" },
  { id: "business_plan", label: "Business plan", template: "generate business plan for {project}" },
];

export function fillSuggestedAction(template: string, projectName: string | null): string {
  if (projectName) return template.replaceAll("{project}", projectName);
  return template.replace(/\s+for\s+\{project\}/i, "").replace("{project}", "").trim();
}

/**
 * Proactive openers shown on the empty Loki transcript — Loki offers to look
 * across the whole fleet before you type. Each `prompt` is a complete, fleet-
 * wide instruction (no {project}); Loki answers it from its full fleet context
 * (all projects + goals + dev logs + essays), so the intelligence lives in the
 * prompt, not new code. This is what makes Loki proactive: it surfaces what
 * needs attention and asks the questions that would help it move work forward.
 */
export type LokiProactiveStarter = { id: string; label: string; prompt: string };

export const LOKI_PROACTIVE_STARTERS: LokiProactiveStarter[] = [
  {
    id: "attention",
    label: "What needs my attention?",
    prompt:
      "Review my whole fleet. Pick the 2–3 projects that most need my attention right now, and for each say in one line why (e.g. stale, blocked, thin context, no goals set, ready to ship). Then for each, ask me ONE specific question whose answer would most help you move it forward. Cite the project. Don't list every project — only the ones that genuinely need attention.",
  },
  {
    id: "synergies",
    label: "Find hidden synergies",
    prompt:
      "Look across all my projects and name the 2 strongest hidden synergies — which projects each connects and the concrete opportunity. Cite the sources you use.",
  },
  {
    id: "fill_context",
    label: "Fill a context gap",
    prompt:
      "Which of my projects has the thinnest or most out-of-date context (missing goals, stub description, stale dev log)? Pick the one where a short conversation would help you most, then ask me 3 focused questions to fill it in.",
  },
];
