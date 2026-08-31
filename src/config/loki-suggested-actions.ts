/**
 * Loki start-page chips — SSOT for what the composer offers.
 *
 * Three states, three actions each. Dispatch chips only appear once a project
 * is scoped, because unscoped "move forward" / "code review" cannot run.
 */

export type LokiChipKind = "send" | "prefill" | "open_projects" | "href";

export type LokiComposerChip = {
  id: string;
  label: string;
  kind: LokiChipKind;
  /** NL for send/prefill. `{project}` is replaced when one project is scoped. */
  template?: string;
  href?: string;
  /** Send as chat (no dispatch). Fleet questions, not agent work. */
  chatOnly?: boolean;
};

export const LOKI_NEW_PROJECT_HREF = "/control/new-from-scratch";
export const LOKI_IMPORT_PROJECT_HREF = "/control/import";

export const LOKI_ATTENTION_PROMPT =
  "Review my whole fleet. Pick the 2–3 projects that most need my attention right now, and for each say in one line why. Then for each, ask me ONE specific question whose answer would most help you move it forward. Cite the project. Don't list every project.";

const NEW_PROJECT_CHIP: LokiComposerChip = {
  id: "new_project",
  label: "New project",
  kind: "href",
  href: LOKI_NEW_PROJECT_HREF,
};

const IMPORT_PROJECT_CHIP: LokiComposerChip = {
  id: "import_project",
  label: "I have one",
  kind: "href",
  href: LOKI_IMPORT_PROJECT_HREF,
};

const OPEN_PROJECT_CHIP: LokiComposerChip = {
  id: "open_project",
  label: "Open a project",
  kind: "open_projects",
};

const ATTENTION_CHIP: LokiComposerChip = {
  id: "attention",
  label: "What needs me",
  kind: "send",
  chatOnly: true,
  template: LOKI_ATTENTION_PROMPT,
};

export const LOKI_SCOPED_CHIPS: LokiComposerChip[] = [
  {
    id: "move_forward",
    label: "Move forward",
    kind: "send",
    template: "move forward on {project}",
  },
  { id: "quality", label: "Review", kind: "send", template: "code review for {project}" },
  {
    id: "test_and_fix",
    label: "Fix tests",
    kind: "send",
    template: "fix types and tests for {project}",
  },
];

export function fillSuggestedAction(template: string, projectName: string | null): string {
  if (projectName) return template.replaceAll("{project}", projectName);
  return template
    .replace(/\s+(?:on|for|in)\s+\{project\}/gi, "")
    .replaceAll("{project}", "")
    .replace(/\s+/g, " ")
    .trim();
}

export function composerChips(input: {
  projectCount: number;
  selectedProjects: string[];
  selectedGoal?: { title: string } | null;
}): LokiComposerChip[] {
  const selected = input.selectedProjects;
  if (selected.length === 1) {
    const name = selected[0];
    const goal = input.selectedGoal;
    if (goal?.title) {
      return [
        {
          id: "active_goal",
          label: "Move forward",
          kind: "send",
          template: `Move ${name} toward its active goal: ${goal.title}. Inspect the current state and complete the highest-impact next step you can verify.`,
        },
        LOKI_SCOPED_CHIPS[1],
        LOKI_SCOPED_CHIPS[2],
      ];
    }
    return LOKI_SCOPED_CHIPS;
  }
  if (selected.length > 1) {
    return [
      { id: "move_forward_many", label: "Move forward", kind: "send", template: "move forward" },
      { id: "quality_many", label: "Review", kind: "send", template: "code review" },
      {
        id: "test_and_fix_many",
        label: "Fix tests",
        kind: "send",
        template: "fix types and tests",
      },
    ];
  }
  if (input.projectCount === 0) {
    return [NEW_PROJECT_CHIP, IMPORT_PROJECT_CHIP];
  }
  return [NEW_PROJECT_CHIP, OPEN_PROJECT_CHIP, ATTENTION_CHIP];
}

/** Fleet-wide openers for the floating assistant (other pages). */
export type LokiProactiveStarter = { id: string; label: string; prompt: string };

export const LOKI_PROACTIVE_STARTERS: LokiProactiveStarter[] = [
  { id: "attention", label: "What needs me", prompt: LOKI_ATTENTION_PROMPT },
];
