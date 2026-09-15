/**
 * One reader for "we asked a model for JSON and it answered with something".
 *
 * There were four hand-rolled copies of this, and they did not agree:
 *
 *   - feedback/digest-producer sliced first `{` … last `}` and never returned
 *     null — so a reply with a `</think>` leak or trailing prose containing a
 *     brace produced a slice that could not parse, and the sweep silently
 *     skipped the project;
 *   - frontier/digest handled code fences but not reasoning tags;
 *   - orchestration/dod-gate handled reasoning tags but not code fences (its
 *     own comment called itself "a third hand-rolled copy");
 *   - frontier/propose was the only one that did both.
 *
 * Three algorithms for one job is a latent bug: whichever copy a new caller
 * reaches for decides which model quirks it survives. So this is the union of
 * what each copy knew, in the order the quirks actually arrive:
 *
 *   1. drop private reasoning (`stripReasoning` — a leak can carry braces);
 *   2. unwrap a ```json fence, unless the fence holds no object (a prose reply
 *      can fence a shell snippet and leave the JSON outside it);
 *   3. scan for the first BALANCED `{…}`, ignoring braces inside strings.
 *
 * Step 3 is where the copies were wrong in the same way: a naive depth counter
 * closes the object early on `{"gap":"remove the } here"}`, and first-`{`-to-
 * last-`}` overshoots past any trailing prose. Reading string state costs one
 * boolean and removes both failures.
 *
 * Parsing is deliberately in this module too, not left to each caller: the
 * trailing-comma retry below only exists once because of it. It runs ONLY after
 * a strict parse has already failed, so it can never change the reading of a
 * reply that was valid JSON to begin with.
 */
import { stripReasoning } from "@/lib/agent/llm";

/**
 * The model's JSON object, sliced out of whatever it wrapped it in.
 * Returns null when there is no balanced object to read — a refusal, a reply
 * with no JSON at all, or one cut off mid-object by the token ceiling.
 */
export function extractJson(raw: string): string | null {
  const text = stripReasoning(raw);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1]?.includes("{") ? fenced[1] : text;

  const start = body.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return body.slice(start, i + 1);
  }
  return null;
}

/**
 * Drop commas that sit immediately before a closer. Small models emit
 * `{"a":1,}` often enough to be worth one retry, and JSON.parse rejects it.
 * String-aware, so a comma inside a value is never touched.
 */
function dropTrailingCommas(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i]!;
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j]!)) j++;
      if (json[j] === "}" || json[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}

/** Parse the model's JSON answer, or null if there isn't a readable one. */
export function safeParseModelJson<T = unknown>(raw: string): T | null {
  const json = extractJson(raw);
  if (json === null) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    // fall through to the one repair worth attempting
  }
  try {
    return JSON.parse(dropTrailingCommas(json)) as T;
  } catch {
    return null;
  }
}

/**
 * Parse the model's JSON answer, throwing when there isn't one. For callers
 * whose surrounding try/catch already treats an unreadable reply as "skip this
 * one" — the throw and the null are the same decision, spelled differently.
 */
export function parseModelJson<T = unknown>(raw: string): T {
  const parsed = safeParseModelJson<T>(raw);
  if (parsed === null) throw new Error("model returned no JSON object");
  return parsed;
}
