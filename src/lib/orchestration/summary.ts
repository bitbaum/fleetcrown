import {
  ORCHESTRATION_TASK_SUMMARY_FIELDS,
  type OrchestrationTaskSummary,
  type OrchestrationTaskSummaryField,
} from "@/lib/orchestration/contract";

export function parseOrchestrationSummary(text: string | undefined): OrchestrationTaskSummary | undefined {
  if (!text) return undefined;

  const fields: Partial<Record<OrchestrationTaskSummaryField, string>> = {};
  const fieldNames = ORCHESTRATION_TASK_SUMMARY_FIELDS.join("|");
  const fieldPattern = new RegExp(`^(${fieldNames}):\\s*(.*)$`, "i");

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(fieldPattern);
    if (!match) continue;

    const key = match[1].toLowerCase() as OrchestrationTaskSummaryField;
    fields[key] = match[2].trim();
  }

  if (!ORCHESTRATION_TASK_SUMMARY_FIELDS.some((field) => fields[field])) return undefined;

  return {
    status: fields.status ?? "",
    "last-3-same-dir": fields["last-3-same-dir"] ?? "",
    "wip-or-revert-in-last-5": fields["wip-or-revert-in-last-5"] ?? "",
    tsc: fields.tsc ?? "",
    lint: fields.lint ?? "",
    done: fields.done ?? "",
    next: fields.next ?? "",
    tests: fields.tests ?? "",
    todos: fields.todos ?? "",
    commit: fields.commit ?? "",
    health: fields.health ?? "",
  };
}
