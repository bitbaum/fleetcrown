import type { ProjectData } from "@/components/projects/project-detail-types";
import { HEALTH_SIGNAL_CONFIG } from "@/components/projects/project-badges";

/** Build a rich context prompt about a project for Ivy. */
export function buildProjectIvyPrompt(data: {
  name: string;
  description?: string | null;
  attrs: Record<string, string>;
}): string {
  const a = data.attrs;
  const issueLines = HEALTH_SIGNAL_CONFIG
    .filter((cfg) => a[cfg.key])
    .map((cfg) => `${cfg.cardLabel}: ${a[cfg.key]}`);
  return [
    `Project: ${data.name}`,
    a["status"]    && `Status: ${a["status"]}`,
    a["maturity"]  && `Maturity: ${a["maturity"]}`,
    data.description && `Description: ${data.description}`,
    a["next_step"] && `Next Step: ${a["next_step"]}`,
    a["stack"]     && `Stack: ${a["stack"]}`,
    a["mission"]   && `Mission: ${a["mission"]}`,
    ...issueLines,
    "",
    "What should I focus on for this project right now? Biggest risks and immediate next steps?",
  ].filter(Boolean).join("\n");
}

// Re-export so callers that previously imported ProjectData don't need a second import.
export type { ProjectData };
