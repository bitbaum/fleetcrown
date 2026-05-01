import type { OrchestrationTaskSummary } from "@/lib/orchestration/contract";

export function parseOrchestrationSummary(text: string | undefined): OrchestrationTaskSummary | undefined {
  if (!text) return undefined;

  const fields: Partial<OrchestrationTaskSummary> = {};

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(done|next|tests|todos|health):\s*(.*)$/i);
    if (!match) continue;

    const key = match[1].toLowerCase() as keyof OrchestrationTaskSummary;
    fields[key] = match[2].trim();
  }

  if (!fields.done && !fields.next && !fields.tests && !fields.todos && !fields.health) return undefined;

  return {
    done: fields.done ?? "",
    next: fields.next ?? "",
    tests: fields.tests ?? "",
    todos: fields.todos ?? "",
    health: fields.health ?? "",
  };
}
