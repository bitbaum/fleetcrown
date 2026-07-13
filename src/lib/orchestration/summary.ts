import {
  ORCHESTRATION_TASK_SUMMARY_FIELDS,
  type OrchestrationTaskSummary,
  type OrchestrationTaskSummaryField,
} from "@/lib/orchestration/contract";

/**
 * Build a complete OrchestrationTaskSummary from a partial field map, defaulting
 * every missing field to "". Generated from ORCHESTRATION_TASK_SUMMARY_FIELDS so
 * adding a field to that SSOT array automatically persists it everywhere — no
 * hand-written object literal can silently drop a field again (the bug that left
 * `block-reason`/`no-op-count` unsaved despite being in the contract).
 */
export function buildOrchestrationSummary(
  fields: Partial<Record<OrchestrationTaskSummaryField, string | undefined>>,
): OrchestrationTaskSummary {
  // Object.fromEntries infers a string-record; the summary also has the optional
  // structured `verification` field (absent here — set only by the DoD gate at
  // close), so cast through unknown. Every required text field is present via the
  // SSOT field list above.
  return Object.fromEntries(
    ORCHESTRATION_TASK_SUMMARY_FIELDS.map((field) => [field, fields[field] ?? ""]),
  ) as unknown as OrchestrationTaskSummary;
}

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

  return buildOrchestrationSummary(fields);
}
