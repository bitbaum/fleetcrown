/**
 * Prompt composition for feedback → agent dispatch.
 * SSOT so single-row Implement and batch "Implement all as one" stay aligned.
 */
import { fenceUntrusted, inlineUntrusted, UNTRUSTED_PREAMBLE } from "@/lib/feedback/untrusted";

export type FeedbackPromptFields = {
  suggestion: string;
  duplicateCount: number;
  url: string | null;
  page: string | null;
  scope: string | null;
  selectedElements: Array<{ elementType: string; elementText: string; selector: string }> | null;
};

function renderElements(feedback: FeedbackPromptFields): string[] {
  if (!feedback.selectedElements?.length) return [];
  const lines = ["Element(s) the visitor pointed at:"];
  for (const el of feedback.selectedElements) {
    lines.push(
      `- <${inlineUntrusted(el.elementType, 100)}> ${inlineUntrusted(el.selector, 500)}${el.elementText ? ` — "${inlineUntrusted(el.elementText, 100)}"` : ""}`,
    );
  }
  return lines;
}

/** One visitor report → one scoped fix prompt. */
export function composeFeedbackFixPrompt(
  feedback: FeedbackPromptFields,
  projectName: string,
  note?: string,
): string {
  const times = feedback.duplicateCount > 1 ? ` (reported ${feedback.duplicateCount}×)` : "";
  const lines = [
    `Fix this visitor feedback on ${projectName}.${times}`,
    UNTRUSTED_PREAMBLE,
    "",
    ...(note ? [`OPERATOR INSTRUCTION: ${note}`, ""] : []),
    fenceUntrusted("FEEDBACK", feedback.suggestion),
    `Page: ${inlineUntrusted(feedback.url ?? feedback.page ?? "unknown", 1000)}`,
  ];
  if (feedback.scope) lines.push(`Scope the visitor selected: ${feedback.scope}`);
  lines.push(...renderElements(feedback));
  lines.push(
    "",
    "Scope: address exactly this feedback — no unrelated refactors.",
    "Verify the fix in the running app before claiming done, and record what you actually did (with evidence) in your final session handoff.",
  );
  return lines.join("\n");
}

/**
 * Many NEW reports → one agent run. Prefer this over N separate Dispatch clicks
 * when the captain wants a single coherent pass (shared root cause or a small
 * pile). Synthesize (theme briefs back into the inbox) is the alternative when
 * volume is high and you want another triage gate first.
 */
export function composeFeedbackBatchFixPrompt(
  items: FeedbackPromptFields[],
  projectName: string,
  note?: string,
): string {
  const lines = [
    `Fix these ${items.length} visitor-feedback items on ${projectName} in one pass.`,
    UNTRUSTED_PREAMBLE,
    "",
    ...(note ? [`OPERATOR INSTRUCTION: ${note}`, ""] : []),
    "Address every item below. Prefer one coherent change set when items share a root cause; otherwise fix them independently, most recent first.",
    "Scope: only these reports — no unrelated refactors.",
    "Verify each fix in the running app before claiming done, and record evidence in your handoff.",
    "",
  ];
  items.forEach((f, i) => {
    const times = f.duplicateCount > 1 ? ` (reported ${f.duplicateCount}×)` : "";
    lines.push(`### ${i + 1}/${items.length}${times}`);
    lines.push(fenceUntrusted("FEEDBACK", f.suggestion));
    lines.push(`Page: ${inlineUntrusted(f.url ?? f.page ?? "unknown", 1000)}`);
    if (f.scope) lines.push(`Scope: ${f.scope}`);
    lines.push(...renderElements(f));
    lines.push("");
  });
  return lines.join("\n");
}

/** Minimum NEW visitor items before Synthesize (theme briefs) is useful. */
export const SYNTHESIZE_MIN_ITEMS = 3;
