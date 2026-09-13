/**
 * Pull a JSON object out of a model reply.
 *
 * Every path that asks a model for structured output needs this, because no
 * model reliably returns bare JSON: it fences the block, it prefixes "Here is
 * the breakdown:", and a reasoning model puts a `<think>` monologue in front of
 * the whole thing. Four hand-rolled copies of this scan already exist in the
 * codebase — lib/frontier/propose.ts, lib/frontier/digest.ts,
 * lib/feedback/digest-producer.ts and lib/orchestration/dod-gate.ts — and the
 * comment on the fourth records what the duplication cost: the copies drifted,
 * the chat path ended up with the one that did not strip reasoning, and a
 * model's private monologue shipped into a transcript a human read.
 *
 * This is the superset of those four (fence-aware AND reasoning-stripped), put
 * somewhere they can all move to. New callers use this one.
 */

import { stripReasoning } from "@/lib/agent/llm";

/**
 * The first balanced `{...}` in a reply, or null.
 *
 * Brace-matching rather than a regex because the object is nested and a lazy
 * regex stops at the first inner `}`. Returns null on a reply that was cut off
 * mid-object — callers that can salvage a partial array should do so on the
 * raw text, as frontier/propose does.
 */
export function extractJsonObject(raw: string): string | null {
  const text = stripReasoning(raw);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    // Braces inside a string literal are not structure. Prose in a description
    // field routinely contains one, and counting it corrupts the depth.
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return body.slice(start, i + 1);
  }
  return null;
}

/** Extract and parse in one step. Null on anything that is not a clean object. */
export function parseJsonObject<T>(raw: string): T | null {
  const json = extractJsonObject(raw);
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
