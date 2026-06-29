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
