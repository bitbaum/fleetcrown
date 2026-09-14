// Pure: no db, no env — scripts/test/plan-as-answer.ts imports it directly.

/**
 * Did the model hand us its PLAN instead of an answer?
 *
 * Observed 2026-09-14 on the Groq fallback (openai/gpt-oss-20b, 39 facts,
 * "cite every claim"): the reply began "We need to answer: … We must cite each
 * claim … Let's go through each:" and spent the whole token budget narrating
 * how it would answer. No `<think>` tags, so stripReasoning() let it through;
 * grounding passed, because a plan makes no claims. The operator read the
 * model's notes to itself. Groq puts gpt-oss reasoning in a separate field —
 * this was the FINAL channel; at low effort the model thinks out loud there.
 *
 * Shape-based on purpose: the first lines are the model addressing itself in
 * the first person plural about the task, not the operator about the fleet.
 */
export function looksLikePlan(text: string): boolean {
  const head = text.trim().slice(0, 600);
  if (!head) return false;
  const self =
    /^(we need to|we must|we should|we have to|let'?s (?:go|list|start|answer)|the user (?:asks|wants|is asking)|i need to|first,? (?:we|i) (?:need|must|should))\b/i;
  const lines = head
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return false;
  if (self.test(lines[0]!)) return true;
  // Or the plan is spread over the opening paragraph: several self-directed
  // sentences before any answer-shaped line.
  const sentences = head.split(/(?<=[.!?])\s+/).slice(0, 6);
  return sentences.filter((x) => self.test(x)).length >= 2;
}

/** Appended when the first attempt came back as a plan. */
export const ANSWER_ONLY =
  "\n\n---\n\nWrite ONLY the final answer for the operator, in prose or a short list. Do not describe how you will answer, do not narrate your method, do not address yourself. Start with the answer itself.";
